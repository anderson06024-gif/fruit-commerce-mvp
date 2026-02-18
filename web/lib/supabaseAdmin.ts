import { createClient } from "@supabase/supabase-js";
import { mustGetEnv } from "./env";

export function supabaseAdmin() {
  const url = mustGetEnv("https://iaqkypswuadhmrxnseig.supabase.co
");
  const serviceKey = mustGetEnv("https://iaqkypswuadhmrxnseig.supabase.co/auth/v1
");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
