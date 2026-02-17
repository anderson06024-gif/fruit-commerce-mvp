import { z } from "zod";
import { getBearerToken, jsonError, jsonOk, requireUserAndRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const Body = z.object({
  driver_id: z.string().uuid(),
  route_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonError("MISSING_BEARER_TOKEN", 401);

    const me = await requireUserAndRole(token);
    if (me.role !== "admin") return jsonError("ROLE_NOT_ALLOWED", 403);

    const body = Body.parse(await req.json());
    const adb = supabaseAdmin();

    // verify driver exists and role=driver
    const { data: driver, error: dErr } = await adb.from("users").select("id, role").eq("id", body.driver_id).single();
    if (dErr || !driver) return jsonError("DRIVER_NOT_FOUND", 400);
    if (driver.role !== "driver") return jsonError("TARGET_NOT_DRIVER", 400);

    const { data: route, error } = await adb
      .from("routes")
      .insert({ driver_id: body.driver_id, route_date: body.route_date, status: "assigned" })
      .select("id, driver_id, route_date, status, created_at")
      .single();

    if (error || !route) return jsonError("ROUTE_CREATE_FAILED", 500);

    return jsonOk({ route });
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "UNKNOWN_ERROR";
    const status = msg === "UNAUTHORIZED" ? 401 : 400;
    return jsonError(msg, status);
  }
}
