"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { cookieOptions } from "@/lib/supabase/cookie-options";

export function createClient() {
  const { url, anonKey } = getSupabaseEnvironment();
  return createBrowserClient(url, anonKey, { cookieOptions });
}
