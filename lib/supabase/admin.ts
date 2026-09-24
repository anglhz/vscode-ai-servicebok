import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Privileged server backend only; never accepts a caller's JWT. */
export function createAdminClient(fetcher?: typeof fetch) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server database configuration is missing.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(fetcher ? { global: { fetch: fetcher } } : {}),
  });
}
