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
async function account(premium = false) {
  const user = randomUUID(); await db.query("insert into auth.users values($1)", [user]);
  if (premium) await db.query("insert into subscriptions(user_id,plan,status,current_period_end) values($1,'premium','active',now()+interval '1 month')", [user]);
  return user;
}
async function vehicle(user: string) { return asUser(user, async () => (await db.query<{ id: string }>("select create_vehicle('car','Volvo','V60') as id")).rows[0].id); }
async function document(user: string, v: string, size = 10485760) { return asUser(user, async () => (await db.query<{ id: string; storage_path: string }>("select * from create_document($1,'kvitto.pdf','application/pdf',$2,'receipt')", [v,size])).rows[0]); }
async function overview(user: string) { return asUser(user, async () => (await db.query<{ value: { plan: string; document_bytes: number } }>("select get_billing_overview() as value")).rows[0].value); }
beforeAll(async () => {
  await db.exec(`create role service_role bypassrls;create role anon;create role authenticated;create schema auth;create schema storage;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$select false$$;
    grant usage on schema public,auth,storage to authenticated,anon,service_role;grant select,insert,update,delete on storage.objects to authenticated,anon;`);
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(file,dir),"utf8"));
},30000);
afterAll(() => db.close());

it("Free creates first vehicle but a second reservation rolls back the vehicle too", async () => {
  const user = await account(); await vehicle(user);
  const before = (await db.query("select count(*) from vehicles")).rows;
  await expect(vehicle(user)).rejects.toMatchObject({code:"P1001"});
  expect((await db.query("select count(*) from vehicles")).rows).toEqual(before);
});
it("ended ownership does not consume the Free allowance", async () => {
  const user = await account(), v = await vehicle(user);
  await db.query("update vehicle_ownerships set ended_at=now(),status='ended' where vehicle_id=$1",[v]);
  expect(await vehicle(user)).toBeTruthy();
});
it("Premium creates multiple vehicles; downgrade keeps them and rejects additions", async () => {
  const user = await account(true); await vehicle(user); await vehicle(user);
  await db.query("update subscriptions set status='canceled',plan='free' where user_id=$1",[user]);
  expect((await db.query<{count:number}>("select count(*)::int as count from vehicle_ownerships where user_id=$1",[user])).rows[0].count).toBe(2);
  await expect(vehicle(user)).rejects.toMatchObject({code:"P1001"});
});
it.each(["active","trialing","past_due","canceled","unpaid","incomplete","incomplete_expired","paused","inactive"])("central entitlement maps %s explicitly", async status => {
  const user = await account(true); await db.query("update subscriptions set status=$2 where user_id=$1",[user,status]);
  expect((await overview(user)).plan).toBe(["active","trialing"].includes(status)?"premium":"free");
});
it("an expired or absent period fails closed despite an active stored plan", async () => {
  const user = await account(true);
  for (const period of ["2020-01-01",null]) {
    await db.query("update subscriptions set current_period_end=$2 where user_id=$1",[user,period]);
    expect((await overview(user)).plan).toBe("free");
  }
});
it("subscriptions are own-read only; authenticated users cannot invoke backend RPCs or read event/lease state", async () => {
  const user = await account(true), other = await account(true);
  await asUser(user, async () => {
    expect((await db.query("select user_id from subscriptions")).rows).toEqual([{user_id:user}]);
    for (const sql of ["update subscriptions set plan='premium'","delete from subscriptions",`insert into subscriptions(user_id) values('${other}')`,"select * from stripe_webhook_events","select * from billing_operations",`select billing_acquire('${user}')`,`select is_premium_user('${other}')`]) await expect(db.exec(sql)).rejects.toMatchObject({code:"42501"});
  });
});
it("Free quota counts pending bytes, excludes soft-deleted bytes, and permits exact capacity", async () => {
  const user=await account(),v=await vehicle(user),first=await document(user,v);
  for(let n=0;n<4;n++) await document(user,v);
  expect((await overview(user)).document_bytes).toBe(52428800);
  await expect(document(user,v,1)).rejects.toMatchObject({code:"P1002"});
  await asUser(user,()=>db.query("select soft_delete_document($1,$2)",[v,first.id]));
  expect(await document(user,v)).toBeTruthy();
});
it("Premium has higher quota and downgrade preserves documents while blocking more bytes", async () => {
  const user=await account(true),v=await vehicle(user);
  for(let n=0;n<6;n++) await document(user,v);
  await db.query("update subscriptions set plan='free',status='canceled' where user_id=$1",[user]);
  expect((await overview(user)).document_bytes).toBe(62914560);
  await expect(document(user,v,1)).rejects.toMatchObject({code:"P1002"});
});
it("Free recipient with one vehicle cannot accept; sender ownership and transfer remain intact", async () => {
  const seller=await account(),buyer=await account(),v=await vehicle(seller);await vehicle(buyer);
  const transfer=await asUser(seller,async()=>(await db.query<{id:string;token:string}>("select * from create_vehicle_transfer($1)",[v])).rows[0]);
  await expect(asUser(buyer,()=>transferServer(db, "accept", createHash("sha256").update(transfer.token).digest("hex")))).rejects.toMatchObject({code:"P1001"});
  expect((await db.query("select user_id from vehicle_ownerships where vehicle_id=$1 and ended_at is null",[v])).rows).toEqual([{user_id:seller}]);
  expect((await db.query("select status from vehicle_transfers where id=$1",[transfer.id])).rows).toEqual([{status:"pending"}]);
});
it("selected transferred documents move quota; over-quota transfer is entirely rolled back", async () => {
  const seller=await account(true),buyer=await account(),v=await vehicle(seller),ids:string[]=[];
  for(let n=0;n<6;n++) {const d=await document(seller,v);ids.push(d.id);await db.query("insert into storage.objects(bucket_id,name,metadata) values('vehicle_documents',$1,'{\"size\":10485760,\"mimetype\":\"application/pdf\"}')",[d.storage_path]);await asUser(seller,()=>db.query("select finalize_document($1,$2)",[v,d.id]));}
  const transfer=await asUser(seller,async()=>(await db.query<{id:string;token:string}>("select * from create_vehicle_transfer($1,$2)",[v,ids])).rows[0]);
  const accept=()=>asUser(buyer,()=>transferServer(db, "accept", createHash("sha256").update(transfer.token).digest("hex")));
  await expect(accept()).rejects.toMatchObject({code:"P1002"});
  expect((await db.query("select user_id from vehicle_ownerships where vehicle_id=$1 and ended_at is null",[v])).rows).toEqual([{user_id:seller}]);
  expect((await overview(seller)).document_bytes).toBe(62914560);
  await db.query("insert into subscriptions(user_id,plan,status,current_period_end) values($1,'premium','active',now()+interval '1 month')",[buyer]);
  await accept();expect((await overview(buyer)).document_bytes).toBe(62914560);expect((await overview(seller)).document_bytes).toBe(0);
});
type CustomerOperation = {lease_token:string;customer_key:string;customer_started_at:string|null};
async function acquire(user:string) {return (await db.query<{v:{operation:CustomerOperation}}>("select billing_acquire($1) as v",[user])).rows[0].v.operation;}
async function customerStart(user:string,lease:string) {return (await db.query<{v:CustomerOperation}>("select billing_operation($1,$2,'customer_start') as v",[user,lease])).rows[0].v;}
it("ordinary billing leases never start a Customer attempt, including reacquisition",async()=>{
  const user=await account(),first=await acquire(user);expect(first.customer_started_at).toBeNull();
  await db.query("select billing_operation($1,$2,'release')",[user,first.lease_token]);
  const second=await acquire(user);expect(second.customer_started_at).toBeNull();expect(second.customer_key).toBe(first.customer_key);
});
it("customer_start requires the lease, persists start time, and retains key/time on retry",async()=>{
  const user=await account(),initial=await acquire(user);
  await expect(customerStart(user,randomUUID())).rejects.toMatchObject({code:"55P03"});
  const first=await customerStart(user,initial.lease_token);
  expect(first.customer_started_at).not.toBeNull();expect(first.customer_key).toBe(initial.customer_key);
  await db.query("select billing_operation($1,$2,'release')",[user,initial.lease_token]);
  const retryLease=await acquire(user),retry=await customerStart(user,retryLease.lease_token);
  expect(retry.customer_started_at).toBe(first.customer_started_at);expect(retry.customer_key).toBe(first.customer_key);
});
it("an existing Stripe Customer prevents customer_start from initializing an attempt",async()=>{
  const user=await account(),initial=await acquire(user);
  await db.query("select billing_operation($1,$2,'customer',$3)",[user,initial.lease_token,JSON.stringify({id:`cus_${user}`})]);
  const operation=await customerStart(user,initial.lease_token);
  expect(operation.customer_started_at).toBeNull();expect(operation.customer_key).toBe(initial.customer_key);
});
it("lease prevents overlapping billing workers; webhook state and processed marker commit atomically", async () => {
  const user=await account();
  const lease=(await db.query<{v:{operation:{lease_token:string}}}>("select billing_acquire($1) as v",[user])).rows[0].v.operation.lease_token;
  await expect(db.query("select billing_acquire($1)",[user])).rejects.toMatchObject({code:"55P03"});
  await db.query("select billing_operation($1,$2,'customer','{\"id\":\"cus_test\"}')",[user,lease]);
  const state={id:"sub_new",customer:"cus_test",price:"price_premium",price_matches:true,status:"active",created_at:"2026-09-21",period_end:"2099-01-01",cancel_at_period_end:false};
  const apply=(event:string,s=state)=>db.query<{ok:boolean}>("select apply_stripe_subscription($1,$2,$3,'customer.subscription.updated',now(),$4) as ok",[user,lease,event,JSON.stringify(s)]);
  await expect(apply("evt_wrong",{...state,customer:"cus_wrong"})).rejects.toMatchObject({code:"23514"});
  expect((await db.query("select * from stripe_webhook_events where stripe_event_id='evt_wrong'")).rows).toHaveLength(0);
  expect((await apply("evt_first")).rows[0].ok).toBe(true);
  expect((await apply("evt_first",{...state,status:"canceled"})).rows[0].ok).toBe(false);
  expect((await overview(user)).plan).toBe("premium");
  expect((await apply("evt_old",{...state,id:"sub_old",created_at:"2025-01-01",status:"canceled"})).rows[0].ok).toBe(false);
  expect((await overview(user)).plan).toBe("premium");
  await apply("evt_wrong_price",{...state,price_matches:false});expect((await overview(user)).plan).toBe("free");
  await db.query("update billing_operations set lease_expires_at=now()-interval '1 second' where user_id=$1",[user]);
  await expect(apply("evt_late")).rejects.toMatchObject({code:"55P03"});
});
