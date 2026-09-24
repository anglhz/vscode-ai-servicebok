import { afterEach, beforeEach, expect, it, vi } from "vitest";
const cleanup = vi.hoisted(() => vi.fn());
vi.mock("@/services/document-cleanup", () => ({ cleanupDocumentRetention: cleanup }));
import * as route from "@/app/api/internal/document-cleanup/route";
const secret = "test-fixture-".repeat(4);
const request = (authorization?: string, body?: string) => new Request("https://fixture.invalid/api/internal/document-cleanup?limit=999", {
  method: "POST", headers: authorization ? { authorization } : {}, body,
});
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("CRON_SECRET", secret);
  vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
  cleanup.mockResolvedValue({ claimed: 2, deleted: 1, failed: 1, storage_path: "must-not-leak" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it.each([undefined, "Bearer wrong", `bearer ${secret}`, secret])("missing/incorrect auth %s is denied before cleanup", async header => {
  const result = await route.POST(request(header)); expect(result.status).toBe(401); expect(cleanup).not.toHaveBeenCalled();
});
it("valid auth ignores body/query selectors and returns only counts and status", async () => {
  const result = await route.POST(request(`Bearer ${secret}`, JSON.stringify({ limit: 999, document_id: "injected", user_id: "injected", vehicle_id: "injected" })));
  expect(cleanup).toHaveBeenCalledExactlyOnceWith();
  expect(result.status).toBe(200); expect(await result.json()).toEqual({ status: "partial", claimed: 2, deleted: 1, failed: 1 });
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("must-not-leak");
});
it("cookies and a secret in the query cannot authorize cleanup", async () => {
  const result = await route.POST(new Request(`https://fixture.invalid/api/internal/document-cleanup?secret=${secret}`, { method: "POST", headers: { cookie: `session=${secret}` } }));
  expect(result.status).toBe(401); expect(cleanup).not.toHaveBeenCalled();
});
it("does not read even malformed request bodies", async () => {
  cleanup.mockResolvedValue({ claimed: 0, deleted: 0, failed: 0 });
  expect(await (await route.POST(request(`Bearer ${secret}`, "not-json"))).json()).toEqual({ status: "completed", claimed: 0, deleted: 0, failed: 0 });
});
it("failed backend exposes no private exception details in response or logs", async () => {
  cleanup.mockRejectedValue(Error("private-path user vehicle signed-token service-key"));
  const result = await route.POST(request(`Bearer ${secret}`));
  expect(result.status).toBe(503); expect(await result.json()).toEqual({ status: "failed" });
  expect(vi.mocked(console.error).mock.calls).toEqual([["document_cleanup", { status: "failed" }]]);
});
it.each(["", "short"])("missing/weak configured secret fails closed", async value => {
  vi.stubEnv("CRON_SECRET", value); expect((await route.POST(request(`Bearer ${value}`))).status).toBe(503);
  expect(cleanup).not.toHaveBeenCalled();
});
it("exports only POST as a Next HTTP handler", () => {
  expect(Object.keys(route).sort()).toEqual(["POST", "maxDuration", "runtime"]);
});
