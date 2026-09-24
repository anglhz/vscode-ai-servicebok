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
  await client.connect(); connections.push(client); client.testUser = user;
  await client.query("set statement_timeout='10s'");
  if (user) { await client.query("set role authenticated"); await client.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); }
  return client;
}
async function acceptAsServer(client, digest) {
  await client.query('set role service_role');
  try { return await client.query('select public.server_accept_vehicle_transfer($1,$2)', [client.testUser, digest]); }
  finally { await client.query('set role authenticated'); }
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

test("cleanup workers skip locked rows and respect committed leases, expiry and fencing", async () => {
  const owner = await connect(a), first = await connect(), second = await connect();
  const vehicle = (await owner.query("select create_vehicle('car','Cleanup','Concurrency') as id")).rows[0].id;
  for (let n = 0; n < 3; n++) await owner.query("select * from create_document($1,'fixture.pdf','application/pdf',100,'receipt')", [vehicle]);
  await db.query("update documents set created_at=now()-interval '4 hours' where vehicle_id=$1", [vehicle]);
  await first.query("set role service_role"); await second.query("set role service_role");
  await first.query("begin");
  const one = (await first.query("select * from claim_document_cleanup_batch(1)")).rows[0];
  const two = (await second.query("select * from claim_document_cleanup_batch(1)")).rows[0];
  assert.notEqual(one.id, two.id); // Returns while the first row lock is held.
  await first.query("commit");
  const three = (await second.query("select * from claim_document_cleanup_batch(10)")).rows;
  assert.equal(three.length, 1); assert.equal(new Set([one.id, two.id, three[0].id]).size, 3);
  assert.deepEqual((await first.query("select * from claim_document_cleanup_batch(10)")).rows, []);
  await db.query("update private.document_cleanup_claims set expires_at=now()-interval '1 second' where document_id=$1", [one.id]);
  const retry = (await second.query("select * from claim_document_cleanup_batch(1)")).rows[0];
  assert.equal(retry.id, one.id); assert.notEqual(retry.lease_token, one.lease_token);
  assert.equal((await first.query("select complete_document_retention_cleanup($1,$2) as done", [one.id, one.lease_token])).rows[0].done, false);
  for (const lease of [retry, two, three[0]]) assert.equal((await second.query("select complete_document_retention_cleanup($1,$2) as done", [lease.id, lease.lease_token])).rows[0].done, true);
});

test("rolled back cleanup claims leave candidates available to another worker", async () => {
  const owner = await connect(a), first = await connect(), second = await connect();
  const vehicle = (await owner.query("select create_vehicle('car','Cleanup','Rollback') as id")).rows[0].id;
  const doc = (await owner.query("select * from create_document($1,'fixture.pdf','application/pdf',100,'receipt')", [vehicle])).rows[0];
  await db.query("update documents set created_at=now()-interval '4 hours' where id=$1", [doc.id]);
  await first.query("set role service_role"); await second.query("set role service_role");
  await first.query("begin"); await first.query("select * from claim_document_cleanup_batch(1)");
  assert.deepEqual((await second.query("select * from claim_document_cleanup_batch(1)")).rows, []);
  await first.query("rollback");
  const retry = (await second.query("select * from claim_document_cleanup_batch(1)")).rows[0];
  assert.equal(retry.id, doc.id);
  await second.query("select complete_document_retention_cleanup($1,$2)", [retry.id, retry.lease_token]);
});

test("owner cleanup and scheduled cleanup can complete the same absent object safely", async () => {
  const owner = await connect(a), worker = await connect();
  const vehicle = (await owner.query("select create_vehicle('car','Cleanup','User') as id")).rows[0].id;
  const doc = (await owner.query("select * from create_document($1,'fixture.pdf','application/pdf',100,'receipt')", [vehicle])).rows[0];
  await db.query("update documents set created_at=now()-interval '4 hours' where id=$1", [doc.id]);
  await worker.query("set role service_role"); await worker.query("begin");
  const lease = (await worker.query("select * from claim_document_cleanup_batch(1)")).rows[0];
  const pending = owner.query("select * from document_cleanup_candidates($1)", [vehicle]);
  await assertWaiting(owner); await worker.query("commit");
  assert.equal((await pending).rows[0].id, doc.id);
  await owner.query("select complete_document_cleanup($1,$2)", [vehicle, doc.id]);
  assert.equal((await worker.query("select complete_document_retention_cleanup($1,$2) as done", [lease.id, lease.lease_token])).rows[0].done, true);
});

test("fresh migration chain satisfies read-only schema/security audit", async () => {
  const results=await db.query(readFileSync(new URL('../supabase/verification.sql',import.meta.url),'utf8'));
  const summary=results.find(result=>result.rows?.[0]?.postgres_version)?.rows[0];
  assert.ok(summary);console.log('Schema audit:',JSON.stringify(summary));
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
  const pending=acceptAsServer(second, digest).then(()=>({ok:true}),error=>({code:error.code}));
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
  await acceptAsServer(buyer, digest);
  const competing = acceptAsServer(rival, digest).then(() => ({ ok:true }), error => ({ code:error.code }));
  await assertWaiting(rival);
  await buyer.query("commit");
  assert.deepEqual(await competing, { code:"42501" });
  assert.deepEqual((await db.query("select user_id from vehicle_ownerships where vehicle_id=$1 and status='active'", [v])).rows, [{user_id:b}]);
  assert.equal((await db.query("select count(*)::int as count from vehicle_ownerships where vehicle_id=$1", [v])).rows[0].count, 2);
});
test("cancel racing with accept invalidates the capability before waiting acceptance can proceed", async () => {
  const { seller, v, transfer, digest } = await fixture(), buyer = await connect(b);
  await seller.query("begin"); await seller.query("select cancel_vehicle_transfer($1,$2)", [v,transfer.id]);
  const accepting = acceptAsServer(buyer, digest).then(() => ({ok:true}), error => ({code:error.code}));
  await assertWaiting(buyer); await seller.query("commit");
  assert.deepEqual(await accepting, {code:"42501"});
  assert.deepEqual((await db.query("select user_id from vehicle_ownerships where vehicle_id=$1 and status='active'", [v])).rows, [{user_id:a}]);
});
test("transfer waits for an event mutation, preserves it, then denies the seller's subsequent event", async () => {
  const { seller, v, digest } = await fixture(), buyer = await connect(b);
  await seller.query("begin"); await seller.query("select create_service_event($1,'service','Before transfer',current_date,12345)", [v]);
  const accepting = acceptAsServer(buyer, digest);
  await assertWaiting(buyer); await seller.query("commit"); await accepting;
  await assert.rejects(seller.query("select create_service_event($1,'service','After transfer',current_date)", [v]), {code:"42501"});
  assert.deepEqual((await buyer.query("select title,mileage from service_events where vehicle_id=$1", [v])).rows, [{title:"Before transfer",mileage:12345}]);
});

// Both orders must be safe: history wins => delete denied; delete wins => the
// waiting RPC rechecks ownership and cannot insert history for a removed vehicle.
for (const { name, sql, table } of [
  { name: "service event", sql: "select create_service_event($1,'service','Race',current_date,123)", table: "service_events" },
  { name: "document metadata", sql: "select * from create_document($1,'a.pdf','application/pdf',100,'receipt')", table: "documents" },
  { name: "transfer", sql: "select * from create_vehicle_transfer($1)", table: "vehicle_transfers" },
]) {
  for (const deleteFirst of [false, true]) test(`empty vehicle deletion versus ${name}: ${deleteFirst ? 'delete' : 'history'} commits first`, async () => {
    const first = await connect(a), second = await connect(a);
    const v = (await first.query("select create_vehicle('car','Race','Empty') as id")).rows[0].id;
    const deletion = "select delete_empty_vehicle($1)";
    await first.query("begin");
    let pending;
    try {
      await first.query(deleteFirst ? deletion : sql, [v]);
      pending = second.query(deleteFirst ? sql : deletion, [v]).then(() => ({ ok: true }), error => ({ code: error.code }));
      await assertWaiting(second);
      await first.query("commit");
    } finally { await first.query("rollback"); }
    assert.deepEqual(await pending, { code: deleteFirst ? "42501" : "P2001" });
    for (const relation of ["vehicles", "vehicle_ownerships", table]) {
      const column = relation === "vehicles" ? "id" : "vehicle_id";
      assert.equal((await db.query(`select count(*)::int as n from ${relation} where ${column}=$1`, [v])).rows[0].n, deleteFirst ? 0 : 1);
    }
    assert.equal((await db.query("select count(*)::int as n from mileage_entries where vehicle_id=$1", [v])).rows[0].n,
      !deleteFirst && name === "service event" ? 1 : 0);
  });
}

async function limiterAccount() {
  const user = randomUUID(); await db.query("insert into auth.users values($1)", [user]); return user;
}
const consume = (client, user, scope = 'pdf_export') => client.query("select public.consume_rate_limit($1,$2) as result", [scope, user]).then(r => r.rows[0].result);
test("distributed limiter: exactly one of two transactions can consume the last slot", async () => {
  const user = await limiterAccount(), first = await connect(), second = await connect();
  for (let i = 0; i < 4; i++) assert.equal((await consume(db, user)).allowed, true);
  await first.query("begin"); assert.equal((await consume(first, user)).allowed, true);
  const pending = consume(second, user);
  try { await assertWaiting(second); } finally { await first.query("commit"); }
  assert.equal((await pending).allowed, false);
  assert.equal((await db.query("select used from private.rate_limits where user_id=$1", [user])).rows[0].used, 5);
});
test("distributed limiter: 12 independent connections allow exactly five requests in one window", async () => {
  const user = await limiterAccount(), clients = await Promise.all(Array.from({ length: 12 }, () => connect()));
  const results = await Promise.all(clients.map(client => consume(client, user)));
  assert.equal(results.filter(r => r.allowed).length, 5);
  assert.ok(results.filter(r => !r.allowed).every(r => r.retry_after >= 1 && r.retry_after <= 60));
});
test("distributed limiter: expiry reuses the row, users/scopes remain independent", async () => {
  const user = await limiterAccount(), other = await limiterAccount();
  for (let i = 0; i < 5; i++) await consume(db, user);
  assert.equal((await consume(db, user)).allowed, false);
  assert.equal((await consume(db, other)).allowed, true);
  assert.equal((await consume(db, user, 'billing_checkout')).allowed, true);
  await db.query("update private.rate_limits set expires_at=clock_timestamp()-interval '1 second' where user_id=$1 and scope='pdf_export'", [user]);
  assert.equal((await consume(db, user)).allowed, true);
  assert.deepEqual((await db.query("select used from private.rate_limits where user_id=$1 and scope='pdf_export'", [user])).rows, [{ used: 1 }]);
});

// Exercise the complete audit against PostgreSQL-generated proconfig values,
// not a duplicated JS implementation of the search_path predicate.
for (const { name, clause, allowed } of [
  { name: 'empty path', clause: "set search_path = ''", allowed: true },
  { name: 'exact pg_catalog', clause: 'set search_path = pg_catalog', allowed: true },
  { name: 'public', clause: 'set search_path = public', allowed: false },
  { name: 'pg_catalog plus public', clause: 'set search_path = pg_catalog, public', allowed: false },
  { name: 'arbitrary schema', clause: 'set search_path = audit_untrusted', allowed: false },
  { name: 'explicit temporary schema', clause: 'set search_path = pg_catalog, pg_temp', allowed: false },
  { name: 'missing search_path', clause: '', allowed: false },
  { name: 'quoted comma-containing schema name', clause: 'set search_path = "pg_catalog, public"', allowed: false },
]) {
  test(`schema audit SECURITY DEFINER: ${name}`, async () => {
    await db.query(`create function public.audit_search_path_fixture() returns integer
      language sql security definer ${clause} as $$select 1$$`);
    try {
      const audit = readFileSync(new URL('../supabase/verification.sql', import.meta.url), 'utf8');
      if (allowed) await db.query(audit);
      else await assert.rejects(db.query(audit), { code: 'P0001', message: 'Unsafe SECURITY DEFINER search_path' });
    } finally {
      // A rejected read-only audit leaves its explicit transaction aborted.
      await db.query('rollback');
      await db.query('drop function public.audit_search_path_fixture()');
    }
  });
}
