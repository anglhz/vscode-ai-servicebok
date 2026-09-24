import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
const db = new PGlite({ extensions: { pgcrypto } });
beforeAll(async () => {
  await db.exec(`create role service_role bypassrls;create role anon;create role authenticated;create schema auth;create schema storage;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$select false$$;
    grant usage on schema public,auth,storage to authenticated,anon,service_role;grant select,insert,update,delete on storage.objects to authenticated,anon;`);
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(file, dir), "utf8"));
}, 30000);
afterAll(() => db.close());

async function account() { const id = randomUUID(); await db.query("insert into auth.users values($1)", [id]); return id; }
async function consume(user: string, scope: string) {
  await db.exec("set role service_role");
  try { return (await db.query<{ r: { allowed: boolean; retry_after: number } }>("select consume_rate_limit($1,$2) as r", [scope, user])).rows[0].r; }
  finally { await db.exec("reset role"); }
}
it.each([
  ["vehicle_lookup", 10, 60], ["pdf_export", 5, 60], ["billing_checkout", 5, 600],
  ["billing_portal", 10, 600], ["transfer_preview", 30, 60], ["transfer_accept", 10, 600],
] as const)("%s allows exactly %i attempts and returns a bounded wait within %i seconds", async (scope, limit, seconds) => {
  const user = await account();
  for (let i = 0; i < limit; i++) expect(await consume(user, scope)).toEqual({ allowed: true, retry_after: 0 });
  const denied = await consume(user, scope);
  expect(denied.allowed).toBe(false); expect(denied.retry_after).toBeGreaterThanOrEqual(1); expect(denied.retry_after).toBeLessThanOrEqual(seconds);
  for (let i = 0; i < 3; i++) expect((await consume(user, scope)).allowed).toBe(false);
  expect((await db.query("select used from private.rate_limits where user_id=$1", [user])).rows).toEqual([{ used: limit }]);
});
it("expiry reuses one row; account deletion removes idle buckets", async () => {
  const user = await account(); await consume(user, "pdf_export");
  await db.query("update private.rate_limits set used=5,expires_at=clock_timestamp()-interval '1 second' where user_id=$1", [user]);
  expect(await consume(user, "pdf_export")).toEqual({ allowed: true, retry_after: 0 });
  expect((await db.query("select used from private.rate_limits where user_id=$1", [user])).rows).toEqual([{ used: 1 }]);
  await db.query("delete from auth.users where id=$1", [user]);
  expect((await db.query("select 1 from private.rate_limits where user_id=$1", [user])).rows).toEqual([]);
});
it("scope and account isolation prevent interference", async () => {
  const user = await account(), other = await account();
  for (let i = 0; i < 5; i++) await consume(user, "pdf_export");
  expect((await consume(user, "pdf_export")).allowed).toBe(false);
  expect((await consume(other, "pdf_export")).allowed).toBe(true);
  expect((await consume(user, "billing_checkout")).allowed).toBe(true);
});
it("rejects unsupported scopes and missing/nonexistent identities without allocating buckets", async () => {
  const user = await account();
  for (const scope of ["", "webhook", "pdf_export;delete", "PDF_EXPORT"]) await expect(consume(user, scope)).rejects.toMatchObject({ code: "22023" });
  await expect(db.query("select consume_rate_limit('pdf_export',null)")).rejects.toMatchObject({ code: "22023" });
  await expect(consume(randomUUID(), "pdf_export")).rejects.toMatchObject({ code: "23503" });
  expect((await db.query("select 1 from private.rate_limits where user_id=$1", [user])).rows).toEqual([]);
});
it.each(["anon", "authenticated"])("%s cannot access buckets, choose subjects/limits, or bypass the transfer server", async role => {
  const user = await account(); await db.exec(`set role ${role}`);
  try {
    for (const query of [
      "select * from private.rate_limits", "delete from private.rate_limits", "insert into private.rate_limits default values",
      `select consume_rate_limit('pdf_export','${user}')`,
      "select * from preview_vehicle_transfer('digest')", "select accept_vehicle_transfer('digest')",
      `select * from server_preview_vehicle_transfer('${user}','digest')`, `select server_accept_vehicle_transfer('${user}','digest')`,
    ]) await expect(db.query(query)).rejects.toMatchObject({ code: "42501" });
  } finally { await db.exec("reset role"); }
});
it("service_role cannot write the table directly and only safe definer config is used", async () => {
  await db.exec("set role service_role");
  try { await expect(db.query("update private.rate_limits set used=0")).rejects.toMatchObject({ code: "42501" }); }
  finally { await db.exec("reset role"); }
  const rows = (await db.query("select prosecdef,proconfig from pg_proc where proname in ('consume_rate_limit','server_preview_vehicle_transfer','server_accept_vehicle_transfer')")).rows;
  expect(rows).toHaveLength(3); for (const row of rows) expect(row).toEqual({ prosecdef: true, proconfig: ['search_path=""'] });
});
it("a failed transfer does not refund the separately committed attempt or leave actor identity changed", async () => {
  const user = await account(); await consume(user, "transfer_accept");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.exec("set role service_role");
  try {
    await expect(db.query("select server_accept_vehicle_transfer($1,$2)", [user, "0".repeat(64)])).rejects.toMatchObject({ code: "42501" });
    expect((await db.query("select current_setting('request.jwt.claim.sub') as subject")).rows).toEqual([{ subject: "" }]);
    expect((await db.query("select * from server_preview_vehicle_transfer($1,$2)", [user, "0".repeat(64)])).rows).toEqual([]);
    expect((await db.query("select current_setting('request.jwt.claim.sub') as subject")).rows).toEqual([{ subject: "" }]);
  } finally { await db.exec("reset role"); }
  expect((await db.query("select used from private.rate_limits where user_id=$1", [user])).rows).toEqual([{ used: 1 }]);
});
