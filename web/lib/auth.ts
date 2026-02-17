// web/lib/auth.ts
import { createClient } from "@supabase/supabase-js";
import { mustGetEnv } from "./env";

export type AppRole = "customer" | "driver" | "warehouse" | "admin";

export function supabaseAnon() {
  const url = mustGetEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anon = mustGetEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export async function requireUserAndRole(token: string) {
  const sb = supabaseAnon();

  // 驗 JWT → 拿 user
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw new Error("UNAUTHORIZED");

  // ✅ FIX：supabaseAdmin() 回傳的是 SupabaseClient，不是 function，不能再呼叫一次
  const { supabaseAdmin } = await import("./supabaseAdmin");
  const adb = supabaseAdmin();

  const { data: profile, error: pErr } = await adb
    .from("users")
    .select("id, role, email")
    .eq("id", data.user.id)
    .maybeSingle();

  if (pErr || !profile) throw new Error("PROFILE_NOT_FOUND");

  return {
    userId: data.user.id,
    email: profile.email ?? data.user.email ?? null,
    role: profile.role as AppRole,
  };
}

export function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function jsonOk(payload: any, status = 200) {
  return new Response(JSON.stringify({ ok: true, ...payload }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
