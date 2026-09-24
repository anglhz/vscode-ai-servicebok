import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks }));
import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit";
beforeEach(() => { vi.resetAllMocks(); mocks.user.mockResolvedValue({ id: "verified-user" }); });
it("requires verified auth before any privileged RPC", async () => {
  mocks.user.mockRejectedValue(new Error("login")); await expect(enforceRateLimit("vehicle_lookup")).rejects.toThrow("login");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("sends only the fixed scope and verified user, no caller limits or tokens", async () => {
  mocks.rpc.mockResolvedValue({ data: { allowed: true, retry_after: 0 }, error: null });
  await enforceRateLimit("vehicle_lookup");
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("consume_rate_limit", { p_scope: "vehicle_lookup", p_user_id: "verified-user" });
});
it("exposes only safe delay and generic message on deny", async () => {
  mocks.rpc.mockResolvedValue({ data: { allowed: false, retry_after: 40 }, error: null });
  await expect(enforceRateLimit("pdf_export")).rejects.toMatchObject({ message: "För många försök. Vänta en stund och försök igen.", retryAfter: 40 });
  await expect(enforceRateLimit("pdf_export")).rejects.toBeInstanceOf(RateLimitExceededError);
});
it.each([null, {}, { allowed: false, retry_after: -1 }, { allowed: false, retry_after: 601 }, { allowed: true, retry_after: 20 }])("fails closed on malformed limiter response %j", async data => {
  mocks.rpc.mockResolvedValue({ data, error: null }); await expect(enforceRateLimit("pdf_export")).rejects.toThrow("Försöket kunde inte genomföras.");
});
it("DB errors never log or expose tokens, IDs, keys or counters", async () => {
  const logs = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log")];
  try {
    mocks.rpc.mockResolvedValue({ error: { message: "secret-token user-id private-table" } });
    await expect(enforceRateLimit("billing_checkout")).rejects.toThrow("Försöket kunde inte genomföras. Försök igen om en stund.");
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  } finally { logs.forEach(log => log.mockRestore()); }
});
