import { transferServer } from "./helpers/transfer-server";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";

const db = new PGlite({ extensions: { pgcrypto } });
async function asUser<T>(user: string, fn: () => Promise<T>) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  try { return await fn(); } finally { await db.exec("reset role"); }
}
async function account() {
  const user = randomUUID(); await db.query("insert into auth.users values($1)", [user]); return user;
}
async function fixture(mileage: number | null = null) {
  const user = await account();
  const v = await asUser(user, async () => (await db.query<{ id: string }>(
    "select create_vehicle('car','Volvo','V60',p_current_mileage=>$1) as id", [mileage])).rows[0].id);
  return { user, v };
}
const remove = (user: string, v: string) => asUser(user, () => db.query("select delete_empty_vehicle($1)", [v]));
async function blocked(user: string, v: string) {
  await expect(remove(user, v)).rejects.toMatchObject({ code: "P2001" });
  expect((await db.query("select id from vehicles where id=$1", [v])).rows).toHaveLength(1);
  expect((await db.query("select id from vehicle_ownerships where vehicle_id=$1 and status='active'", [v])).rows).toHaveLength(1);
}
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

it("sole owner deletes only the empty vehicle and its ownership, including technical lookup fields", async () => {
  const { user, v } = await fixture(), other = await fixture();
  await db.query("update vehicles set external_provider='test',external_provider_id='fixture',external_data_fetched_at=now() where id=$1", [v]);
  await remove(user, v);
  for (const table of ["vehicle_ownerships", "service_events", "mileage_entries", "documents", "service_intervals", "reminders", "vehicle_transfers"])
    expect((await db.query(`select 1 from ${table} where vehicle_id=$1`, [v])).rows).toHaveLength(0);
  expect((await db.query("select id from vehicles where id=$1", [v])).rows).toHaveLength(0);
  expect((await db.query("select id from vehicles where id=$1", [other.v])).rows).toHaveLength(1);
  expect((await db.query("select user_id from vehicle_ownerships where vehicle_id=$1", [other.v])).rows).toEqual([{ user_id: other.user }]);
});
it("other user cannot delete or learn whether history exists", async () => {
  const { v } = await fixture(); await expect(remove(await account(), v)).rejects.toMatchObject({ code: "42501" });
});
it("missing identity and anonymous role are denied", async () => {
  const { v } = await fixture(); await expect(remove("", v)).rejects.toMatchObject({ code: "42501" });
  await db.exec("set role anon");
  try { await expect(db.query("select delete_empty_vehicle($1)", [v])).rejects.toMatchObject({ code: "42501" }); }
  finally { await db.exec("reset role"); }
});
it("missing vehicle and repeated deletion are denied", async () => {
  const { user, v } = await fixture(); await remove(user, v);
  for (const id of [v, randomUUID()]) await expect(remove(user, id)).rejects.toMatchObject({ code: "42501" });
});
it("no general DELETE grants and only authenticated can execute the safe definer", async () => {
  const { user, v } = await fixture();
  await asUser(user, async () => {
    for (const table of ["vehicles", "vehicle_ownerships"])
      await expect(db.query(`delete from ${table} where id=$1`, [v])).rejects.toMatchObject({ code: "42501" });
  });
  expect((await db.query("select prosecdef,proconfig from pg_proc where oid='public.delete_empty_vehicle(uuid)'::regprocedure")).rows)
    .toEqual([{ prosecdef: true, proconfig: ['search_path=""'] }]);
  expect((await db.query("select has_function_privilege('anon','public.delete_empty_vehicle(uuid)','execute') as anon,has_function_privilege('authenticated','public.delete_empty_vehicle(uuid)','execute') as authenticated")).rows)
    .toEqual([{ anon: false, authenticated: true }]);
});
for (const hidden of [false, true]) it(`service history blocks deletion (soft deleted=${hidden})`, async () => {
  const { user, v } = await fixture();
  await asUser(user, () => db.query("select create_service_event($1,'service','Service',current_date)", [v]));
  if (hidden) await db.query("update service_events set deleted_at=now() where vehicle_id=$1", [v]);
  await blocked(user, v);
});
it("initial mileage including zero blocks deletion", async () => {
  const { user, v } = await fixture(0); await blocked(user, v);
});
it("standalone mileage history blocks even with no current reading", async () => {
  const { user, v } = await fixture();
  await db.query("insert into mileage_entries(vehicle_id,recorded_by_user_id,mileage,recorded_at) values($1,$2,1,now())", [v, user]);
  await blocked(user, v);
});
for (const state of ["pending", "ready", "deleted"]) it(`document metadata blocks deletion (${state})`, async () => {
  const { user, v } = await fixture();
  await asUser(user, () => db.query("select * from create_document($1,'a.pdf','application/pdf',100,'receipt')", [v]));
  if (state === "ready") await db.query("update documents set upload_status='ready' where vehicle_id=$1", [v]);
  if (state === "deleted") await db.query("update documents set deleted_at=now(),storage_deleted_at=now() where vehicle_id=$1", [v]);
  await blocked(user, v);
});
for (const sameUser of [false, true]) it(`previous ownership blocks even for a returning owner (same user=${sameUser})`, async () => {
  const { user, v } = await fixture();
  await db.query("insert into vehicle_ownerships(vehicle_id,user_id,status,ended_at) values($1,$2,'ended',now())", [v, sameUser ? user : await account()]);
  await blocked(user, v);
});
for (const state of ["pending", "cancelled", "expired", "accepted"]) it(`transfer history blocks deletion (${state})`, async () => {
  const { user, v } = await fixture();
  const t = await asUser(user, async () => (await db.query<{ id: string; token: string }>("select * from create_vehicle_transfer($1)", [v])).rows[0]);
  let owner = user;
  if (state === "cancelled") await asUser(user, () => db.query("select cancel_vehicle_transfer($1,$2)", [v, t.id]));
  if (state === "expired") await db.query("update vehicle_transfers set status='expired' where id=$1", [t.id]);
  if (state === "accepted") {
    owner = await account();
    await asUser(owner, () => transferServer(db, "accept", createHash("sha256").update(t.token).digest("hex")));
  }
  await blocked(owner, v);
  expect((await db.query("select status from vehicle_transfers where id=$1", [t.id])).rows).toEqual([{ status: state }]);
});
for (const active of [true, false]) it(`service interval blocks independently of reminders (active=${active})`, async () => {
  const { user, v } = await fixture();
  await db.query("insert into service_intervals(vehicle_id,name,category,month_interval,is_active) values($1,'Oil','oil',12,$2)", [v, active]);
  await blocked(user, v);
});
for (const state of ["active", "completed", "dismissed"]) it(`custom reminder blocks deletion (${state})`, async () => {
  const { user, v } = await fixture();
  const reminder = await asUser(user, async () => (await db.query<{ id: string }>("select create_custom_reminder($1,'Tax',current_date) as id", [v])).rows[0].id);
  if (state !== "active") await asUser(user, () => db.query("select set_reminder_status($1,$2,$3)", [v, reminder, state]));
  await blocked(user, v);
});
it("unexpected Storage object without metadata blocks deletion conservatively", async () => {
  const { user, v } = await fixture();
  await db.query("insert into storage.objects(bucket_id,name) values('vehicle_documents',$1)", [v + "/fixture/original"]);
  await blocked(user, v);
});
it("successful delete restores the Free slot and billing overview without orphan rows", async () => {
  const { user, v } = await fixture();
  const create = () => asUser(user, () => db.query("select create_vehicle('car','Replacement','Car')"));
  await expect(create()).rejects.toMatchObject({ code: "P1001" });
  await remove(user, v);
  const billing = await asUser(user, () => db.query<{ n: number }>("select (get_billing_overview()->>'vehicle_count')::int as n"));
  expect(billing.rows[0].n).toBe(0); await create();
  expect((await db.query("select vehicle_id from vehicle_ownerships where user_id=$1", [user])).rows).toHaveLength(1);
});
it("a future RESTRICT dependency rolls back ownership deletion atomically", async () => {
  const { user, v } = await fixture();
  await db.exec("create table public.delete_dependency_fixture(vehicle_id uuid references public.vehicles(id) on delete restrict)");
  try {
    await db.query("insert into delete_dependency_fixture values($1)", [v]);
    await expect(remove(user, v)).rejects.toMatchObject({ code: "23001" });
    expect((await db.query("select user_id from vehicle_ownerships where vehicle_id=$1", [v])).rows).toEqual([{ user_id: user }]);
  } finally { await db.exec("drop table public.delete_dependency_fixture"); }
});
it("schema inventory requires review when a new vehicle FK is introduced", async () => {
  expect((await db.query<{ name: string }>("select distinct conrelid::regclass::text as name from pg_constraint where contype='f' and confrelid='public.vehicles'::regclass order by name")).rows.map(row => row.name))
    .toEqual(["documents", "mileage_entries", "reminders", "service_events", "service_intervals", "vehicle_ownerships", "vehicle_transfers"]);
});
