import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/auth/app-url";

export async function GET(request: NextRequest) {
  const appUrl = getAppUrl();
  const code = request.nextUrl.searchParams.get("code");
  if (code && code.length <= 2048) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL("/dashboard", appUrl), { headers: { "Cache-Control": "private, no-store" } });
    } catch { /* An invalid or unavailable confirmation must not grant access. */ }
  }
  return NextResponse.redirect(new URL("/auth/confirmation-error", appUrl), { headers: { "Cache-Control": "private, no-store" } });
}
