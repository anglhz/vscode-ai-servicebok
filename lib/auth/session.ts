import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { measurePerformance } from "@/lib/observability/performance";

export const getCurrentUser = cache(async () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const supabase = await createReadOnlyClient();
  // getUser verifies the session with Auth, including revoked/deleted users.
  const { data, error } = await measurePerformance("auth.get_user", () => supabase.auth.getUser());
  return error ? null : data.user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
