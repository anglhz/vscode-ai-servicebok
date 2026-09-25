import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions } from "@/lib/supabase/cookie-options";
import { createPerformanceContext, measurePerformance, performanceRequestHeader } from "@/lib/observability/performance";

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const performanceContext = createPerformanceContext();
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(performanceRequestHeader, performanceContext.requestId);
  let response = NextResponse.next({ request: { headers: forwardedHeaders } });
  response.headers.set("Cache-Control", "private, no-store");
  // Missing configuration must never expose a protected page: requireUser still runs.
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        const previousCookies = response.cookies.getAll();
        const refreshedHeaders = new Headers(request.headers);
        refreshedHeaders.set(performanceRequestHeader, performanceContext.requestId);
        response = NextResponse.next({ request: { headers: refreshedHeaders } });
        previousCookies.forEach((cookie) => response.cookies.set(cookie));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });
  // Refresh before rendering; route/data helpers perform their own identity checks.
  await measurePerformance("proxy.get_claims", () => supabase.auth.getClaims(), performanceContext);
  return response;
}
