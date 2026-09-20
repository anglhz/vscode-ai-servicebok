// Optional native PostgreSQL checks. Creates and drops only its own fresh local test database.
// Set TRANSFER_TEST_PG_MODULE to an installed pg module and TRANSFER_TEST_DATABASE_URL to local Postgres.
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";

const { Client } = createRequire(import.meta.url)(process.env.TRANSFER_TEST_PG_MODULE || "pg");
const url = new URL(process.env.TRANSFER_TEST_DATABASE_URL || "postgres://postgres@127.0.0.1:55439/postgres");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Use an isolated local test server");
const database = "servicebok_transfer_test_" + randomUUID().replaceAll("-", "");
const admin = new Client({ connectionString: url.href });
url.pathname = "/" + database;
const connections = [];
let db;
const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222", c = "33333333-3333-4333-8333-333333333333";
async function connect(user) {
  const client = new Client({ connectionString: url.href });
  await client.connect(); connections.push(client);
  await client.query("set statement_timeout='10s'");
  if (user) { await client.query("set role authenticated"); await client.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); }
  return client;
}
async function fixture() {
  const seller = await connect(a);
  const v = (await seller.query("select create_vehicle('car','Volvo','V60') as id")).rows[0].id;
  const transfer = (await seller.query("select * from create_vehicle_transfer($1)", [v])).rows[0];
  return { seller, v, transfer, digest: createHash("sha256").update(transfer.token).digest("hex") };
}
async function assertWaiting(client) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await db.query("select wait_event_type from pg_stat_activity where pid=$1", [client.processID]);
    if (result.rows[0]?.wait_event_type === "Lock") return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail("Competing transaction did not wait on the expected row lock");
}
before(async () => {
  await admin.connect();
  await admin.query(`create database ${database}`);
  db = await connect();
  await db.query(`do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
    create schema auth; create schema storage; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$select false$$;
    grant usage on schema public,auth,storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated,anon;`);
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const name of readdirSync(migrations).filter(name => name.endsWith(".sql")).sort()) await db.query(readFileSync(new URL(name, migrations), "utf8"));
  await db.query("insert into auth.users values($1),($2),($3)", [a,b,c]);
});
after(async () => {
  await Promise.all(connections.map(client => client.end()));
  await admin.query(`drop database if exists ${database}`);
  await admin.end();
});
test("two overlapping accepts wait on row locks and exactly one recipient becomes owner", async () => {
  const { v, digest } = await fixture(), buyer = await connect(b), rival = await connect(c);
  await buyer.query("begin");
  await buyer.query("select accept_vehicle_transfer($1)", [digest]);
  const competing = rival.query("select accept_vehicle_transfer($1)", [digest]).then(() => ({ ok:true }), error => ({ code:error.code }));
  await assertWaiting(rival);
  await buyer.query("commit");
  assert.deepEqual(await competing, { code:"42501" });
  assert.deepEqual((await db.query("select user_id from vehicle_ownerships where vehicle_id=$1 and status='active'", [v])).rows, [{user_id:b}]);
  assert.equal((await db.query("select count(*)::int as count from vehicle_ownerships where vehicle_id=$1", [v])).rows[0].count, 2);
});
test("cancel racing with accept invalidates the capability before waiting acceptance can proceed", async () => {
  const { seller, v, transfer, digest } = await fixture(), buyer = await connect(b);
  await seller.query("begin"); await seller.query("select cancel_vehicle_transfer($1,$2)", [v,transfer.id]);
  const accepting = buyer.query("select accept_vehicle_transfer($1)", [digest]).then(() => ({ok:true}), error => ({code:error.code}));
  await assertWaiting(buyer); await seller.query("commit");
  assert.deepEqual(await accepting, {code:"42501"});
  assert.deepEqual((await db.query("select user_id from vehicle_ownerships where vehicle_id=$1 and status='active'", [v])).rows, [{user_id:a}]);
});
test("transfer waits for an event mutation, preserves it, then denies the seller's subsequent event", async () => {
  const { seller, v, digest } = await fixture(), buyer = await connect(b);
  await seller.query("begin"); await seller.query("select create_service_event($1,'service','Before transfer',current_date,12345)", [v]);
  const accepting = buyer.query("select accept_vehicle_transfer($1)", [digest]);
  await assertWaiting(buyer); await seller.query("commit"); await accepting;
  await assert.rejects(seller.query("select create_service_event($1,'service','After transfer',current_date)", [v]), {code:"42501"});
  assert.deepEqual((await buyer.query("select title,mileage from service_events where vehicle_id=$1", [v])).rows, [{title:"Before transfer",mileage:12345}]);
});
