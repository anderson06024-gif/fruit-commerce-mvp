import { z } from "zod";
import { getBearerToken, jsonError, jsonOk, requireUserAndRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const Body = z.object({
  qr_code: z.string().min(6),
  proof_photo_url: z.string().url(),
});

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonError("MISSING_BEARER_TOKEN", 401);

    const me = await requireUserAndRole(token);
    if (me.role !== "driver") return jsonError("ROLE_NOT_ALLOWED", 403);

    const body = Body.parse(await req.json());
    const adb = supabaseAdmin();

    const { data: shipment, error: shErr } = await adb
      .from("shipments")
      .select("id, qr_code")
      .eq("qr_code", body.qr_code)
      .single();

    if (shErr || !shipment) return jsonError("SHIPMENT_BY_QR_NOT_FOUND", 404);

    // ensure belongs to this driver
    const { data: link, error: lErr } = await adb
      .from("v_driver_shipments")
      .select("shipment_id, driver_id")
      .eq("driver_id", me.userId)
      .eq("shipment_id", shipment.id)
      .maybeSingle();

    if (lErr || !link) return jsonError("SHIPMENT_NOT_IN_YOUR_ROUTE", 403);

    const { data: updated, error: upErr } = await adb
      .from("shipments")
      .update({ proof_photo_url: body.proof_photo_url })
      .eq("id", shipment.id)
      .select("id, proof_photo_url")
      .single();

    if (upErr || !updated) return jsonError("PROOF_UPDATE_FAILED", 500);

    return jsonOk({ shipment: updated });
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "UNKNOWN_ERROR";
    const status = msg === "UNAUTHORIZED" ? 401 : 400;
    return jsonError(msg, status);
  }
}
