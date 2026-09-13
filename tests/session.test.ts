import { beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("@/lib/supabase/server", () => ({ createReadOnlyClient: async () => ({ auth }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { getCurrentUser, requireUser } from "../lib/auth/session";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-only-key");
});
it("redirects unauthenticated requests", async () => {
  auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  await expect(requireUser()).rejects.toThrow("redirect:/login");
});
it("rejects a rejected session even if a user payload is present", async () => {
  auth.getUser.mockResolvedValue({ data: { user: { id: "forged" } }, error: new Error("invalid session") });
  expect(await getCurrentUser()).toBeNull();
});
it("uses the verified server user", async () => {
  auth.getUser.mockResolvedValue({ data: { user: { id: "verified" } }, error: null });
  expect(await requireUser()).toEqual({ id: "verified" });
});
it("fails closed when Supabase is not configured", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  await expect(requireUser()).rejects.toThrow("redirect:/login");
  expect(auth.getUser).not.toHaveBeenCalled();
});
