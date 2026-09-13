import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const refresh = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (cookies: { name: string; value: string; options: { path: string } }[]) => void } }) => ({
    auth: { getClaims: async () => { options.cookies.setAll([{ name: "sb-test-auth-token", value: "refreshed", options: { path: "/" } }]); refresh.run(); return { data: {} }; } },
  }),
}));
import { updateSession } from "../lib/supabase/proxy";

it("forwards refreshed cookies to both downstream request and browser response without shared caching", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-only-key");
  const request = new NextRequest("http://localhost/dashboard", { headers: { cookie: "sb-test-auth-token=expired" } });
  const response = await updateSession(request);
  expect(refresh.run).toHaveBeenCalled();
  expect(request.cookies.get("sb-test-auth-token")?.value).toBe("refreshed");
  expect(response.cookies.get("sb-test-auth-token")?.value).toBe("refreshed");
  expect(response.headers.get("x-middleware-request-cookie")).toContain("refreshed");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
