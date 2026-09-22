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
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
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
  await db.query("insert into subscriptions(user_id,plan,status,current_period_end) select id,'premium','active',now()+interval '1 year' from profiles");
});
after(async () => {
  await Promise.all(connections.map(client => client.end()));
  await admin.query(`drop database if exists ${database}`);
  await admin.end();
});

test("concurrent Free vehicle creation serializes account allowance and creates exactly one vehicle", async () => {
  const user=randomUUID();await db.query("insert into auth.users values($1)",[user]);
  const first=await connect(user),second=await connect(user);
  await first.query("begin");await first.query("select create_vehicle('car','First','One')");
  const pending=second.query("select create_vehicle('car','Second','Two')").then(()=>({ok:true}),error=>({code:error.code}));
  await assertWaiting(second);await first.query("commit");assert.deepEqual(await pending,{code:"P1001"});
  assert.equal((await db.query("select count(*)::int as n from vehicle_ownerships where user_id=$1 and ended_at is null",[user])).rows[0].n,1);
});

test("concurrent document reservations on different vehicles cannot overspend account quota", async () => {
  const user=randomUUID();await db.query("insert into auth.users values($1)",[user]);
  await db.query("insert into subscriptions(user_id,plan,status,current_period_end) values($1,'premium','active',now()+interval '1 month')",[user]);
  const first=await connect(user),second=await connect(user);
  const v1=(await first.query("select create_vehicle('car','Quota','One') as id")).rows[0].id;
  const v2=(await second.query("select create_vehicle('car','Quota','Two') as id")).rows[0].id;
  await db.query("update subscriptions set plan='free',status='canceled' where user_id=$1",[user]);
  for(let n=0;n<4;n++) await first.query("select * from create_document($1,'a.pdf','application/pdf',10485760,'receipt')",[v1]);
  await first.query("begin");await first.query("select * from create_document($1,'b.pdf','application/pdf',10485760,'receipt')",[v1]);
  const pending=second.query("select * from create_document($1,'c.pdf','application/pdf',10485760,'receipt')",[v2]).then(()=>({ok:true}),error=>({code:error.code}));
  await assertWaiting(second);await first.query("commit");assert.deepEqual(await pending,{code:"P1002"});
  assert.equal((await db.query("select sum(file_size_bytes)::int as n from documents where quota_user_id=$1",[user])).rows[0].n,52428800);
});

test("transfer racing with first Free vehicle creation rolls back the complete transfer", async () => {
  const user=randomUUID();await db.query("insert into auth.users values($1)",[user]);
  const {v,digest}=await fixture(),first=await connect(user),second=await connect(user);
  await first.query("begin");await first.query("select create_vehicle('car','Existing','One')");
  const pending=second.query("select accept_vehicle_transfer($1)",[digest]).then(()=>({ok:true}),error=>({code:error.code}));
  await assertWaiting(second);await first.query("commit");assert.deepEqual(await pending,{code:"P1001"});
  assert.deepEqual((await db.query("select user_id from vehicle_ownerships where vehicle_id=$1 and ended_at is null",[v])).rows,[{user_id:a}]);
});

test("concurrent billing workers obtain one lease; expired worker cannot mutate after reacquisition", async () => {
  const user=randomUUID();await db.query("insert into auth.users values($1)",[user]);
  const first=await connect(),second=await connect();
  const results=await Promise.all([first,second].map(client=>client.query("select billing_acquire($1) as value",[user]).then(result=>({value:result.rows[0].value}),error=>({code:error.code}))));
  assert.equal(results.filter(result=>result.value).length,1);assert.equal(results.filter(result=>result.code==="55P03").length,1);
  const old=results.find(result=>result.value).value.operation.lease_token;
  await db.query("update billing_operations set lease_expires_at=now()-interval '1 second' where user_id=$1",[user]);
  const current=(await first.query("select billing_acquire($1) as value",[user])).rows[0].value.operation.lease_token;
  assert.notEqual(current,old);
  await assert.rejects(second.query("select billing_operation($1,$2,'customer','{\"id\":\"cus_late\"}')",[user,old]),{code:"55P03"});
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
