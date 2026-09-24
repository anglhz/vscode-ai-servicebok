import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";

const db = new PGlite({ extensions: { pgcrypto } });
const user = randomUUID();
let vehicle: string;
type Claim = { id: string; storage_path: string; lease_token: string };
beforeAll(async () => {
  await db.exec(`create role service_role bypassrls; create role anon; create role authenticated;
    create schema auth; create schema storage; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$select false$$;
    grant usage on schema public,auth,storage to authenticated,anon,service_role;
    grant select,insert,update,delete on storage.objects to authenticated,anon;`);
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(file, dir), "utf8"));
  await db.query("insert into auth.users values($1)", [user]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  vehicle = (await db.query<{ id: string }>("select create_vehicle('car','Cleanup','Fixture') as id")).rows[0].id;
  await db.query("select set_config('request.jwt.claim.sub','',false)");
}, 30000);
beforeEach(async () => {
  await db.exec("delete from private.document_cleanup_claims; delete from storage.objects; delete from documents;");
});
afterAll(() => db.close());

async function document(status = "pending", hours = 4, deleted = false, completed = false) {
  const id = randomUUID(), path = `${vehicle}/${id}/original`;
  await db.query(`insert into documents(id,vehicle_id,uploaded_by_user_id,quota_user_id,file_name,storage_path,mime_type,file_size_bytes,document_type,upload_status,created_at,deleted_at,storage_deleted_at)
    values($1,$2,$3,$3,'fixture.pdf',$4,'application/pdf',100,'receipt',$5,now()-make_interval(hours=>$6),case when $7 then now() end,case when $8 then now() end)`,
  [id, vehicle, user, path, status, hours, deleted, completed]);
  return { id, storage_path: path };
}
async function privileged<T>(operation: () => Promise<T>) {
  await db.exec("set role service_role");
  try { return await operation(); } finally { await db.exec("reset role"); }
}
const claim = (limit = 50) => privileged(async () => (await db.query<Claim>("select * from claim_document_cleanup_batch($1)", [limit])).rows);
const complete = (d: Claim) => privileged(async () => (await db.query<{ done: boolean }>("select complete_document_retention_cleanup($1,$2) as done", [d.id, d.lease_token])).rows[0].done);

it.each([
  ["pending", 2, false, false, false],
  ["pending", 4, false, false, true],
  ["ready", 4, false, false, false],
  ["ready", 4, true, false, true],
  ["pending", 4, true, true, false],
  ["ready", 1, true, false, false],
] as const)("candidate status=%s age=%ih deleted=%s completed=%s => %s", async (status, age, deleted, completed, eligible) => {
  const d = await document(status, age, deleted, completed);
  const result = await claim();
  expect(result.map(r => r.id)).toEqual(eligible ? [d.id] : []);
  if (eligible) expect((await db.query<{ deleted_at: Date | null }>("select deleted_at from documents where id=$1", [d.id])).rows[0].deleted_at).not.toBeNull();
});
it("retains ready documents and their quota attribution after ownership ends", async () => {
  const d = await document("ready");
  await db.query("update vehicle_ownerships set status='ended',ended_at=now() where vehicle_id=$1", [vehicle]);
  expect(await claim()).toEqual([]);
  expect((await db.query("select deleted_at,quota_user_id,visibility_scope from documents where id=$1", [d.id])).rows).toEqual([{ deleted_at: null, quota_user_id: user, visibility_scope: "private" }]);
});
it("service role works without auth.uid; committed leases exclude duplicate workers until expiry", async () => {
  await document(); const [first] = await claim();
  expect(await claim()).toEqual([]);
  await db.exec("update private.document_cleanup_claims set expires_at=now()-interval '1 second'");
  const [retry] = await claim();
  expect(retry.id).toBe(first.id); expect(retry.lease_token).not.toBe(first.lease_token);
  expect(await complete(first)).toBe(false); expect(await complete(retry)).toBe(true);
});
it("completion verifies Storage absence and is idempotent while retaining all document metadata", async () => {
  const d = await document(); const [lease] = await claim();
  await db.query("insert into storage.objects(bucket_id,name) values('vehicle_documents',$1)", [d.storage_path]);
  expect(await complete(lease)).toBe(false);
  await db.query("delete from storage.objects where name=$1", [d.storage_path]);
  expect(await complete(lease)).toBe(true);
  const before = (await db.query<{ storage_deleted_at: Date | null; visibility_scope: string }>("select * from documents where id=$1", [d.id])).rows[0];
  expect(before.storage_deleted_at).not.toBeNull(); expect(before.visibility_scope).toBe("private");
  expect(await complete(lease)).toBe(true);
  expect((await db.query("select * from documents where id=$1", [d.id])).rows[0]).toEqual(before);
  expect(await claim()).toEqual([]);
  expect((await db.query("select * from private.document_cleanup_claims")).rows).toEqual([]);
});
it("cannot complete active documents, nonexistent documents, or an expired lease", async () => {
  const d = await document("ready");
  expect(await complete({ ...d, lease_token: randomUUID() })).toBe(false);
  expect(await complete({ ...d, id: randomUUID(), lease_token: randomUUID() })).toBe(false);
  await document(); const [lease] = await claim();
  await db.exec("update private.document_cleanup_claims set expires_at=now()-interval '1 second'");
  expect(await complete(lease)).toBe(false);
});
it.each(["anon", "authenticated"])("%s cannot call global RPCs or access claims", async role => {
  await db.exec(`set role ${role}`);
  try {
    for (const query of ["select * from claim_document_cleanup_batch()", "select complete_document_retention_cleanup(null,null)", "select * from private.document_cleanup_claims", "delete from private.document_cleanup_claims"])
      await expect(db.query(query)).rejects.toMatchObject({ code: "42501" });
  } finally { await db.exec("reset role"); }
});
it("bounds batches and refuses invalid limits", async () => {
  for (let n = 0; n < 3; n++) await document();
  expect(await claim(2)).toHaveLength(2); expect(await claim(2)).toHaveLength(1);
  for (const size of [0, -1, 101]) await expect(claim(size)).rejects.toMatchObject({ code: "22023" });
  await expect(privileged(() => db.query("select * from claim_document_cleanup_batch(null)"))).rejects.toMatchObject({ code: "22023" });
});
it("uses empty definer search paths and forbids direct service-role claim writes", async () => {
  const rows = (await db.query("select prosecdef,proconfig from pg_proc where proname in ('claim_document_cleanup_batch','complete_document_retention_cleanup')")).rows;
  expect(rows).toHaveLength(2);
  rows.forEach(row => expect(row).toEqual({ prosecdef: true, proconfig: ['search_path=""'] }));
  await expect(privileged(() => db.query("delete from private.document_cleanup_claims"))).rejects.toMatchObject({ code: "42501" });
});
