import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { cookieOptions } from "@/lib/supabase/cookie-options";

/** For Server Actions and Route Handlers that may refresh session cookies. */
export async function createClient() {
  const { url, anonKey } = getSupabaseEnvironment();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookieOptions,
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
}

/** The proxy refreshes cookies before Server Components render. */
export async function createReadOnlyClient() {
  const { url, anonKey } = getSupabaseEnvironment();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookieOptions,
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll() {
        // Cookie writes belong to a session-refresh proxy, not a Server Component.
      },
    },
  });
}
