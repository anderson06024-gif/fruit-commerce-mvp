import { z } from "zod";
import { getBearerToken, jsonError, jsonOk, requireUserAndRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const Body = z.object({
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1),
});

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonError("MISSING_BEARER_TOKEN", 401);

    const me = await requireUserAndRole(token);
    if (me.role !== "customer") return jsonError("ROLE_NOT_ALLOWED", 403);

    const body = Body.parse(await req.json());
    const adb = supabaseAdmin();

    // fetch products prices + stock
    const productIds = body.items.map(i => i.product_id);
    const { data: products, error: pErr } = await adb
      .from("products")
      .select("id, price, stock, is_active")
      .in("id", productIds);

    if (pErr) return jsonError("PRODUCT_FETCH_FAILED", 500);
    const map = new Map((products ?? []).map(p => [p.id, p]));

    // validate
    let total = 0;
    for (const it of body.items) {
      const p: any = map.get(it.product_id);
      if (!p || !p.is_active) return jsonError("PRODUCT_NOT_ACTIVE", 400);
      if (p.stock < it.quantity) return jsonError("OUT_OF_STOCK", 400);
      total += Number(p.price) * it.quantity;
    }

    // create order
    const { data: order, error: oErr } = await adb
      .from("orders")
      .insert({ user_id: me.userId, status: "pending", total_amount: total })
      .select("id, status, total_amount, created_at")
      .single();

    if (oErr || !order) return jsonError("ORDER_CREATE_FAILED", 500);

    // create order_items
    const itemsToInsert = body.items.map(it => {
      const p: any = map.get(it.product_id);
      return { order_id: order.id, product_id: it.product_id, quantity: it.quantity, price: p.price };
    });
    const { error: iErr } = await adb.from("order_items").insert(itemsToInsert);
    if (iErr) return jsonError("ORDER_ITEMS_CREATE_FAILED", 500);

    // decrement stock
    // (MVP 簡化：逐筆扣庫存；正式版可改 RPC + transaction)
    for (const it of body.items) {
      const p: any = map.get(it.product_id);
      const newStock = Number(p.stock) - it.quantity;
      const { error: sErr } = await adb.from("products").update({ stock: newStock }).eq("id", it.product_id);
      if (sErr) return jsonError("STOCK_UPDATE_FAILED", 500);
    }

    // create shipment (DB trigger auto generates qr_code)
    const { data: shipment, error: shErr } = await adb
      .from("shipments")
      .insert({ order_id: order.id, status: "created" })
      .select("id, status, qr_code, created_at")
      .single();

    if (shErr || !shipment) return jsonError("SHIPMENT_CREATE_FAILED", 500);

    return jsonOk({ order, shipment });
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "UNKNOWN_ERROR";
    const status = msg === "UNAUTHORIZED" ? 401 : 400;
    return jsonError(msg, status);
  }
}
