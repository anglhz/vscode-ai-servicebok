import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn(), from: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: m.admin }));
import { cleanupDocumentRetention } from "@/services/document-cleanup";
const candidate = () => ({ id: randomUUID(), storage_path: "private/fixture/original", lease_token: randomUUID() });
let items: ReturnType<typeof candidate>[];
beforeEach(() => {
  vi.resetAllMocks(); items = [candidate()];
  m.admin.mockReturnValue({ rpc: m.rpc, storage: { from: m.from } });
  m.from.mockReturnValue({ remove: m.remove }); m.remove.mockResolvedValue({ data: [], error: null });
  m.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_document_cleanup_batch" ? items : true, error: null }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("successful delete or successful empty response completes the fenced claim", async () => {
  expect(await cleanupDocumentRetention()).toEqual({ claimed: 1, deleted: 1, failed: 0 });
  expect(m.rpc).toHaveBeenCalledWith("claim_document_cleanup_batch", { p_limit: 50 });
  expect(m.from).toHaveBeenCalledWith("vehicle_documents");
  expect(m.remove).toHaveBeenCalledWith([items[0].storage_path]);
  expect(m.rpc).toHaveBeenCalledWith("complete_document_retention_cleanup", { p_document_id: items[0].id, p_lease_token: items[0].lease_token });
});
it("explicit missing-object code is verified by completion RPC", async () => {
  m.remove.mockResolvedValue({ error: { code: "NoSuchKey" } });
  expect(await cleanupDocumentRetention()).toEqual({ claimed: 1, deleted: 1, failed: 0 });
  expect(m.rpc).toHaveBeenCalledTimes(2);
});
it.each([{ status: 404 }, { code: "NoSuchBucket" }, { code: "InternalError" }])("ambiguous Storage error %j does not finalize", async error => {
  m.remove.mockResolvedValue({ error });
  expect(await cleanupDocumentRetention()).toEqual({ claimed: 1, deleted: 0, failed: 1 });
  expect(m.rpc).toHaveBeenCalledTimes(1);
});
it("one failed document does not stop other candidates and raw errors are never logged", async () => {
  items = [candidate(), candidate(), candidate()];
  m.remove.mockRejectedValueOnce(Error("secret path token"));
  const log = vi.spyOn(console, "error");
  expect(await cleanupDocumentRetention()).toEqual({ claimed: 3, deleted: 2, failed: 1 });
  expect(log).not.toHaveBeenCalled(); log.mockRestore();
});
it.each([{ data: false, error: null }, { data: null, error: { message: "private" } }])("failed finalization is counted for retry", async result => {
  m.rpc.mockImplementation(async (name: string) => name === "claim_document_cleanup_batch" ? { data: items, error: null } : result);
  expect(await cleanupDocumentRetention()).toEqual({ claimed: 1, deleted: 0, failed: 1 });
});
it("claim failure fails closed without attempting Storage", async () => {
  m.rpc.mockResolvedValue({ error: { message: "private" } });
  await expect(cleanupDocumentRetention()).rejects.toThrow("Document cleanup unavailable.");
  expect(m.remove).not.toHaveBeenCalled();
});
it("limits concurrent Storage requests to five", async () => {
  items = Array.from({ length: 50 }, candidate);
  let active = 0, maximum = 0;
  m.remove.mockImplementation(async () => { maximum = Math.max(maximum, ++active); await new Promise(resolve => setTimeout(resolve, 1)); active--; return { error: null }; });
  expect(await cleanupDocumentRetention()).toEqual({ claimed: 50, deleted: 50, failed: 0 });
  expect(maximum).toBe(5);
});
it("installs abortable network requests without replacing caller cancellation", async () => {
  await cleanupDocumentRetention();
  const fetcher = m.admin.mock.calls[0][0] as typeof fetch;
  const fetchMock = vi.fn().mockResolvedValue(new Response()); vi.stubGlobal("fetch", fetchMock);
  const controller = new AbortController(); controller.abort();
  await fetcher("https://fixture.invalid", { signal: controller.signal });
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
});
it("deadline stops new Storage work and leaves remaining candidates retryable", async () => {
  items = [candidate(), candidate()];
  vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(AbortSignal.abort());
  expect(await cleanupDocumentRetention()).toEqual({ claimed: 2, deleted: 0, failed: 2 });
  expect(m.remove).not.toHaveBeenCalled(); expect(m.rpc).toHaveBeenCalledTimes(1);
});
