import { NextResponse, type NextRequest } from "next/server";
import { getAppUrl } from "@/lib/auth/app-url";
import { transferTokenSchema } from "@/lib/validation/transfer";
import { transferCookieName, transferCookieOptions } from "@/lib/auth/transfer-continuation";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const token = transferTokenSchema.safeParse((await params).token);
  const destination = request.nextUrl.searchParams.get("mode") === "signup" ? "/signup" : "/login";
  const response = NextResponse.redirect(new URL(destination, getAppUrl()), { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  if (token.success) response.cookies.set(transferCookieName, token.data, transferCookieOptions);
  else response.cookies.delete(transferCookieName);
  return response;
}
