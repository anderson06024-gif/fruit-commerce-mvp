// web/lib/auth.ts
import type { NextRequest } from "next/server";

/**
 * MVP auth helper:
 * - Reads actor_id from request headers (x-actor-id) or Bearer token (optional future)
 * - Fetches role from public.users via service_role supabase admin client
 */

export type ActorRole = "customer" | "driver" | "warehouse" | "admin";

export async function getActorId(req: NextRequest): Promise<string | null> {
  // Minimal / MVP: trust an explicit header set by your app / gateway
  const actorId = req.headers.get("x-actor-id");
  if (actorId && actorId.trim().length > 0) return actorId.trim();

  // Future-ready: support Bearer token (not implemented in MVP)
  // const auth = req.headers.get("authorization") || "";
  // if (auth.startsWith("Bearer ")) { ... }

  return null;
}

export async function requireRole(req: NextRequest, allowed: ActorRole[]) {
  const actorId = await getActorId(req);
  if (!actorId) {
    return { ok: false as const, status: 401, message: "unauthorized: missing actor" };
  }

  // ✅ FIX: only call supabaseAdmin() ONCE. It returns a SupabaseClient.
  const { supabaseAdmin } = await import("./supabaseAdmin");
  const adb = supabaseAdmin();

  const { data: profile, error: pErr } = await adb
    .from("users")
    .select("id, role, email")
    .eq("id", actorId)
    .maybeSingle();

  if (pErr) {
    return { ok: false as const, status: 500, message: `profile query failed: ${pErr.message}` };
  }

  if (!profile) {
    return { ok: false as const, status: 403, message: "forbidden: user not found" };
  }

  const role = profile.role as ActorRole;

  if (!allowed.includes(role)) {
    return { ok: false as const, status: 403, message: `forbidden: role ${role}` };
  }

  return { ok: true as const, actorId, role, profile };
}
