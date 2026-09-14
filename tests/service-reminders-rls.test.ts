import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const db = new PGlite({ extensions: { pgcrypto } });
const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
let vehicleA: string, vehicleB: string;
async function asUser<T>(user: string, fn: () => Promise<T>) {
  await db.exec("set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  try { return await fn(); } finally { await db.exec("reset role"); }
}
async function save(vehicle = vehicleA, distance: number | null = 3000, months: number | null = 12, date: string | null = "2026-08-12", mileage: number | null = 8420, id: string | null = null) {
  return (await db.query<{ id: string }>("select public.save_service_interval($1,' Olja och filter ','oil',$2,$3,$4,$5,$6) as id", [vehicle,distance,months,date,mileage,id])).rows[0].id;
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$ select false $$;
    grant usage on schema public,auth,storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated,anon;`);
  for (const [index,name] of ["profiles","vehicles","service_history","documents","vehicle_lookup","service_reminders"].entries()) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/20260913000${index+1}00_${name}.sql`,import.meta.url),"utf8"));
  }
  await db.query("insert into auth.users values($1),($2)",[a,b]);
  for (const user of [a,b]) {
    const id = await asUser(user,async()=>(await db.query<{ id: string }>("select public.create_vehicle('car','Volvo','V60',p_current_mileage=>10840) as id")).rows[0].id);
    if (user === a) vehicleA = id; else vehicleB = id;
  }
},30000);
afterAll(()=>db.close());

describe("central service due/status calculation",()=>{
  it.each([
    ["2026-08-12",12,8420,3000,"2027-08-12",11420],
    [null,null,8420,3000,null,11420],
    ["2026-08-12",12,null,null,"2027-08-12",null],
    ["2024-01-31",1,null,null,"2024-02-29",null],
    ["2024-02-29",12,null,null,"2025-02-28",null],
    [null,12,null,3000,null,null],
  ])("calculates date/mileage and clamps calendar months (%s)",async(date,months,mileage,distance,expectedDate,expectedMileage)=>{
    const result=await db.query("select due_date::text,due_mileage from public.service_due($1,$2,$3,$4)",[date,months,mileage,distance]);
    expect(result.rows[0]).toEqual({due_date:expectedDate,due_mileage:expectedMileage});
  });
  it.each([
    ["2027-08-12",11420,10840,true,true,3000,"ok"],
    [null,11420,11120,false,true,3000,"due_soon"],
    [null,11420,11119,false,true,3000,"ok"],
    [null,11420,11421,false,true,3000,"overdue"],
    [null,11420,11420,false,true,3000,"due_soon"],
    ["2026-10-13",null,null,true,false,null,"due_soon"],
    ["2026-10-14",null,null,true,false,null,"ok"],
    ["2026-09-12",null,null,true,false,null,"overdue"],
    ["2026-09-13",null,null,true,false,null,"due_soon"],
    [null,null,null,true,false,null,"unknown"],
    [null,null,10840,false,true,3000,"unknown"],
    [null,11420,null,false,true,3000,"unknown"],
    [null,11420,10840,true,true,3000,"unknown"],
    [null,11420,11421,true,true,3000,"overdue"],
    ["2026-09-12",12000,10000,true,true,3000,"overdue"],
    [null,12000,11500,false,true,null,"due_soon"],
  ])("classifies first-due, missing baseline and exact thresholds %#",async(date,mileage,current,expectDate,expectMileage,distance,state)=>{
    const result=await db.query("select * from public.service_due_status($1,$2,$3,$4,$5,$6,date '2026-09-13')",[date,mileage,current,expectDate,expectMileage,distance]);
    expect(result.rows[0]).toMatchObject({urgency:state});
  });
  it("returns unknown for a combined interval with missing date and mileage due soon",async()=>{
    const result=await db.query("select * from public.service_due_status(null,11420,11120,true,true,3000,date '2026-09-13')");
    expect(result.rows[0]).toMatchObject({urgency:"unknown",remaining_days:null,remaining_mileage:300});
  });
  it("returns unknown for a combined interval with missing mileage and date due within 30 days",async()=>{
    const result=await db.query("select * from public.service_due_status(date '2026-10-13',null,10840,true,true,3000,date '2026-09-13')");
    expect(result.rows[0]).toMatchObject({urgency:"unknown",remaining_days:30,remaining_mileage:null});
  });
  it("returns overdue for a combined interval with an overdue date and missing mileage",async()=>{
    const result=await db.query("select * from public.service_due_status(date '2026-09-12',null,10840,true,true,3000,date '2026-09-13')");
    expect(result.rows[0]).toMatchObject({urgency:"overdue",remaining_days:-1,remaining_mileage:null});
  });
  it("uses Swedish calendar days across midnight and DST",async()=>{
    await db.exec("set timezone='America/Los_Angeles'");
    const result=await db.query("select (timestamptz '2026-03-29 22:30:00+00' at time zone 'Europe/Stockholm')::date::text as day, (date '2026-03-30'-date '2026-03-29') as days");
    expect(result.rows[0]).toEqual({day:"2026-03-30",days:1});
  });
});
describe("interval/reminder mutations and RLS",()=>{
  it("creates owner interval and one reminder from auth.uid, then syncs without duplicates",async()=>{
    const id=await asUser(a,()=>save());
    const first=(await db.query<{ id: string }>("select id from reminders where service_interval_id=$1",[id])).rows[0].id;
    await asUser(a,()=>save(vehicleA,4000,24,"2026-08-12",8420,id));
    expect((await db.query("select id,user_id,due_date::text,due_mileage,status from reminders where service_interval_id=$1",[id])).rows)
      .toEqual([{id:first,user_id:a,due_date:"2028-08-12",due_mileage:12420,status:"active"}]);
    expect((await db.query("select name,source from service_intervals where id=$1",[id])).rows[0]).toEqual({name:"Olja och filter",source:"owner"});
  });
  it("completion recalculates the same reminder while leaving mileage history/current mileage unchanged",async()=>{
    const id=await asUser(a,()=>save());
    const reminder=(await db.query<{ id: string }>("select id from reminders where service_interval_id=$1",[id])).rows[0].id;
    const history=(await db.query("select * from mileage_entries where vehicle_id=$1",[vehicleA])).rows;
    await asUser(a,async()=>{
      await db.query("select set_reminder_status($1,$2,'dismissed')",[vehicleA,reminder]);
      await db.query("select complete_service_interval($1,$2,'2026-09-13',8000)",[vehicleA,id]);
    });
    expect((await db.query("select id,due_date::text,due_mileage,status from reminders where service_interval_id=$1",[id])).rows)
      .toEqual([{id:reminder,due_date:"2027-09-13",due_mileage:11000,status:"active"}]);
    expect((await db.query("select current_mileage from vehicles where id=$1",[vehicleA])).rows[0]).toEqual({current_mileage:10840});
    expect((await db.query("select * from mileage_entries where vehicle_id=$1",[vehicleA])).rows).toEqual(history);
  });
  it("derives status from updated mileage history without changing interval baseline",async()=>{
    const id=await asUser(a,()=>save(vehicleA,3000,null,null,8420));
    await asUser(a,()=>db.query("select create_service_event($1,'service','Ny service','2026-09-13',12000)",[vehicleA]));
    const row=(await asUser(a,()=>db.query("select urgency,remaining_mileage from service_interval_overview where id=$1",[id]))).rows[0];
    expect(row).toEqual({urgency:"overdue",remaining_mileage:-580});
  });
  it("denies B access to A tables/views and every interval/reminder mutation",async()=>{
    const id=await asUser(a,()=>save()); const rid=(await db.query<{ id: string }>("select id from reminders where service_interval_id=$1",[id])).rows[0].id;
    await asUser(b,async()=>{
      for(const table of ["service_intervals","reminders","service_interval_overview","reminder_overview"]) expect((await db.query(`select * from public.${table} where vehicle_id=$1`,[vehicleA])).rows).toEqual([]);
      await expect(save(vehicleA)).rejects.toMatchObject({code:"42501"});
      await expect(save(vehicleB,3000,12,null,null,id)).rejects.toMatchObject({code:"42501"});
      for(const [sql,args] of [["select complete_service_interval($1,$2,current_date,100)",[vehicleA,id]],["select deactivate_service_interval($1,$2)",[vehicleA,id]],["select set_reminder_status($1,$2,'dismissed')",[vehicleA,rid]],["select create_custom_reminder($1,'Attack',current_date)",[vehicleA]]] as const)
        await expect(db.query(sql,[...args])).rejects.toMatchObject({code:"42501"});
    });
  });
  it("requires valid interval/custom inputs and prevents direct writes/permanent deletes",async()=>{
    await asUser(a,async()=>{
      for(const [distance,months,mileage] of [[null,null,null],[0,null,null],[-1,null,null],[1,1201,null],[3000,null,-1],[2147483647,null,1]]) await expect(save(vehicleA,distance,months,null,mileage)).rejects.toMatchObject({code:"23514"});
      await expect(db.query("select create_custom_reminder($1,'No due')",[vehicleA])).rejects.toMatchObject({code:"23514"});
      for(const table of ["service_intervals","reminders"]) for(const sql of [`delete from ${table}`,`update ${table} set vehicle_id='${vehicleB}'`]) await expect(db.exec(sql)).rejects.toMatchObject({code:"42501"});
      await expect(db.exec(`insert into reminders(vehicle_id,user_id,title,reminder_type,due_date) values('${vehicleA}','${b}','Attack','custom',current_date)`)).rejects.toMatchObject({code:"42501"});
      await expect(db.query("select sync_interval_reminder(gen_random_uuid())")).rejects.toMatchObject({code:"42501"});
    });
  });
  it("completes custom reminders but requires interval completion for linked reminders",async()=>{
    const interval=await asUser(a,()=>save());const linked=(await db.query<{ id: string }>("select id from reminders where service_interval_id=$1",[interval])).rows[0].id;
    await asUser(a,async()=>{
      await expect(db.query("select set_reminder_status($1,$2,'completed')",[vehicleA,linked])).rejects.toMatchObject({code:"22023"});
      const custom=(await db.query<{ id: string }>("select create_custom_reminder($1,' Vinterdäck ',current_date,12000) as id",[vehicleA])).rows[0].id;
      await db.query("select set_reminder_status($1,$2,'completed')",[vehicleA,custom]);
      expect((await db.query("select title,user_id,status,completed_at is not null as complete from reminders where id=$1",[custom])).rows[0])
        .toEqual({title:"Vinterdäck",user_id:a,status:"completed",complete:true});
    });
  });
  it("deactivates without deleting history and hides the linked reminder from the overview",async()=>{
    const id=await asUser(a,()=>save());
    await asUser(a,()=>db.query("select deactivate_service_interval($1,$2)",[vehicleA,id]));
    expect((await db.query("select is_active from service_intervals where id=$1",[id])).rows[0]).toEqual({is_active:false});
    expect((await db.query("select status from reminders where service_interval_id=$1",[id])).rows[0]).toEqual({status:"dismissed"});
    expect((await asUser(a,()=>db.query("select * from reminder_overview where service_interval_id=$1",[id]))).rows).toEqual([]);
  });
  it("rolls back an interval change if reminder synchronization fails",async()=>{
    const id=await asUser(a,()=>save());
    await db.exec("create function fail_reminder() returns trigger language plpgsql as $$ begin raise exception 'fixture failure'; end $$; create trigger fail_reminder before update on reminders for each row execute function fail_reminder()");
    try { await asUser(a,async()=>{await expect(save(vehicleA,9000,12,"2026-08-12",8420,id)).rejects.toThrow("fixture failure");}); }
    finally {await db.exec("drop trigger fail_reminder on reminders; drop function fail_reminder()");}
    expect((await db.query("select distance_interval from service_intervals where id=$1",[id])).rows[0]).toEqual({distance_interval:3000});
  });
  it("enforces same-vehicle links, unique interval reminders and revoked ownership",async()=>{
    const id=await asUser(a,()=>save());
    await expect(db.query("insert into reminders(vehicle_id,user_id,service_interval_id,title,reminder_type) values($1,$2,$3,'Cross','service')",[vehicleB,b,id])).rejects.toThrow();
    await db.query("update vehicle_ownerships set status='ended',ended_at=now() where vehicle_id=$1",[vehicleA]);
    await asUser(a,async()=>{
      expect((await db.query("select * from service_interval_overview where id=$1",[id])).rows).toEqual([]);
      expect((await db.query("select * from reminder_overview where vehicle_id=$1",[vehicleA])).rows).toEqual([]);
      await expect(save(vehicleA)).rejects.toMatchObject({code:"42501"});
      await expect(db.query("select complete_service_interval($1,$2,current_date,100)",[vehicleA,id])).rejects.toMatchObject({code:"42501"});
    });
  });
});
