import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
import { createPerformanceContext, measurePerformance } from "@/lib/observability/performance";

afterEach(() => vi.restoreAllMocks());

it("logs only the timing allowlist and preserves the operation result", async () => {
  vi.stubEnv("VERCEL_REGION", "arn1");
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const context = createPerformanceContext("11111111-1111-4111-8111-111111111111");

  await expect(measurePerformance("vehicles.main_query", async () => "result", context)).resolves.toBe("result");

  const record = JSON.parse(String(info.mock.calls[0][0]));
  expect(record).toEqual({
    category: "navigation_performance",
    step: "vehicles.main_query",
    duration_ms: expect.any(Number),
    outcome: "ok",
    request_id: "11111111-1111-4111-8111-111111111111",
    vercel_region: "arn1",
  });
});

it("logs an error outcome without logging the error or sensitive values", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const context = createPerformanceContext("22222222-2222-4222-8222-222222222222");
  const secret = new Error("token=must-not-leak");

  await expect(measurePerformance("auth.get_user", async () => { throw secret; }, context)).rejects.toBe(secret);

  const output = String(info.mock.calls[0][0]);
  expect(output).not.toContain("must-not-leak");
  expect(JSON.parse(output).outcome).toBe("error");
});
