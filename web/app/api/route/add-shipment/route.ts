import { z } from "zod";
import { getBearerToken, jsonError, jsonOk, requireUserAndRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const Body = z.object({
  route_id: z.string().uuid(),
  shipment_id: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonError("MISSING_BEARER_TOKEN", 401);

    const me = await requireUserAndRole(token);
    if (me.role !== "admin") return jsonError("ROLE_NOT_ALLOWED", 403);

    const body = Body.parse(await req.json());
    const adb = supabaseAdmin();

    // verify route exists
    const { data: route, error: rErr } = await adb.from("routes").select("id, status").eq("id", body.route_id).single();
    if (rErr || !route) return jsonError("ROUTE_NOT_FOUND", 400);

    // verify shipment exists
    const { data: shipment, error: sErr } = await adb.from("shipments").select("id, status").eq("id", body.shipment_id).single();
    if (sErr || !shipment) return jsonError("SHIPMENT_NOT_FOUND", 400);

    // insert mapping (DB trigger will set shipment -> assigned if created)
    const { data: rs, error } = await adb
      .from("route_shipments")
      .insert({ route_id: body.route_id, shipment_id: body.shipment_id })
      .select("id, route_id, shipment_id")
      .single();

    if (error || !rs) return jsonError("ROUTE_SHIPMENT_LINK_FAILED", 500);

    const { data: updated, error: uErr } = await adb.from("shipments").select("id, status").eq("id", body.shipment_id).single();
    if (uErr || !updated) return jsonError("SHIPMENT_REFRESH_FAILED", 500);

    return jsonOk({ route_shipment: rs, shipment: updated });
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "UNKNOWN_ERROR";
    const status = msg === "UNAUTHORIZED" ? 401 : 400;
    return jsonError(msg, status);
  }
}
