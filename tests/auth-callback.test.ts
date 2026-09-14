import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, has: () => false, delete: vi.fn() }) }));
const auth = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
import { GET } from "../app/auth/callback/route";
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

it.each([null, { message: "invalid code" }])("uses configured origin for callback result %j", async (error) => {
  vi.stubEnv("APP_URL", "https://servicebok.example");
  auth.exchangeCodeForSession.mockResolvedValue({ error });
  const response = await GET(new NextRequest("https://untrusted.example/auth/callback?code=test&next=https://evil.example"));
  expect(response.headers.get("location")).toBe("https://servicebok.example" + (error ? "/auth/confirmation-error" : "/dashboard"));
  expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("test");
});
