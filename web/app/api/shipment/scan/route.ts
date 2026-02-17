import { z } from "zod";
import { getBearerToken, jsonError, jsonOk, requireUserAndRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const Body = z.object({
  qr_code: z.string().min(6),
  action: z.enum(["pickup", "delivered"]),
});

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonError("MISSING_BEARER_TOKEN", 401);

    const me = await requireUserAndRole(token);
    if (me.role !== "driver") return jsonError("ROLE_NOT_ALLOWED", 403);

    const body = Body.parse(await req.json());
    const adb = supabaseAdmin();

    // find shipment by qr_code
    const { data: shipment, error: shErr } = await adb
      .from("shipments")
      .select("id, status, qr_code")
      .eq("qr_code", body.qr_code)
      .single();

    if (shErr || !shipment) return jsonError("SHIPMENT_BY_QR_NOT_FOUND", 404);

    // ensure this shipment belongs to a route assigned to this driver
    const { data: link, error: lErr } = await adb
      .from("v_driver_shipments")
      .select("route_id, driver_id, shipment_id, shipment_status")
      .eq("driver_id", me.userId)
      .eq("shipment_id", shipment.id)
      .maybeSingle();

    if (lErr || !link) return jsonError("SHIPMENT_NOT_IN_YOUR_ROUTE", 403);

    // state transition by action
    const nextStatus = body.action === "pickup" ? "out_for_delivery" : "delivered";
    const patch: any = { status: nextStatus };
    if (nextStatus === "delivered") patch.delivered_at = new Date().toISOString();

    const { data: updated, error: upErr } = await adb
      .from("shipments")
      .update(patch)
      .eq("id", shipment.id)
      .select("id, status, delivered_at")
      .single();

    if (upErr || !updated) return jsonError("SHIPMENT_UPDATE_FAILED", 400); // DB trigger might reject

    await adb.from("scan_logs").insert({
      actor_id: me.userId,
      shipment_id: shipment.id,
      action: body.action,
      qr_code: body.qr_code,
    });

    return jsonOk({ shipment: updated });
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "UNKNOWN_ERROR";
    const status = msg === "UNAUTHORIZED" ? 401 : 400;
    return jsonError(msg, status);
  }
}
