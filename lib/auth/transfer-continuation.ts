import "server-only";
import { cookies } from "next/headers";
import { transferTokenSchema } from "@/lib/validation/transfer";

export const transferCookieName = "servicebok-transfer";
export const transferCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 7 * 24 * 60 * 60 };

// Only a validated capability can produce this one internal route. No arbitrary next URL.
export async function consumeTransferContinuation() {
  const store = await cookies();
  const parsed = transferTokenSchema.safeParse(store.get(transferCookieName)?.value);
  if (store.has(transferCookieName)) store.delete(transferCookieName);
  return parsed.success ? `/transfer/${parsed.data}` : "/dashboard";
}
