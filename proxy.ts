import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/dashboard/:path*", "/vehicles/:path*", "/new/:path*", "/reminders/:path*", "/account/:path*", "/login", "/signup", "/auth/:path*"],
};
