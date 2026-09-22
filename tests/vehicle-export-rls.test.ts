import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { createHash } from "node:crypto";
import { readFileSync,readdirSync } from "node:fs";
import { beforeAll,afterAll,it,expect } from "vitest";
import { createVehicleExportModel } from "@/services/exports/model";
const db=new PGlite({extensions:{pgcrypto}}),a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
let v:string;
async function asUser<T>(user:string,fn:()=>Promise<T>){await db.exec("set role authenticated");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);try{return await fn();}finally{await db.exec("reset role");}}
async function snapshot(){return (await db.query<{data:unknown}>("select get_vehicle_export_data($1) as data",[v])).rows[0].data;}
beforeAll(async()=>{
  await db.exec(`create role service_role bypassrls; create role anon;create role authenticated;create schema auth;create schema storage;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$select false$$;
    grant usage on schema public,auth,storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated,anon;`);
  const dir=new URL("../supabase/migrations/",import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith(".sql")).sort())await db.exec(readFileSync(new URL(name,dir),"utf8"));
  await db.query("insert into auth.users values($1),($2)",[a,b]);
  v=await asUser(a,async()=>(await db.query<{id:string}>("select create_vehicle('car','Volvo','V60',p_current_mileage=>10000) as id")).rows[0].id);
},30000);
afterAll(()=>db.close());
it("allows A's empty export, denies B and anon, and runs as invoker",async()=>{
  expect(createVehicleExportModel(await asUser(a,snapshot)).events).toEqual([]);
  expect(await asUser(b,snapshot)).toBeNull();
  await db.exec("set role anon");try{await expect(snapshot()).rejects.toMatchObject({code:"42501"});}finally{await db.exec("reset role");}
  expect((await db.query("select prosecdef from pg_proc where proname='get_vehicle_export_data'")).rows).toEqual([{prosecdef:false}]);
});
it("exports visible events oldest first while excluding soft-deleted events and private notes",async()=>{
  await asUser(a,async()=>{
    await db.query("select create_service_event($1,'service','Senare',date '2026-09-20',12450,10,p_notes=>'SECRET_NOTE')",[v]);
    await db.query("select create_service_event($1,'repair','Tidigare',date '2020-01-01',8000,20,p_description=>'Bromsar bytta')",[v]);
    const deleted=(await db.query<{id:string}>("select create_service_event($1,'service','DELETED_TITLE',current_date) as id",[v])).rows[0].id;
    await db.query("select soft_delete_service_event($1,$2)",[v,deleted]);
  });
  const raw=await asUser(a,snapshot),model=createVehicleExportModel(raw);
  expect(model.events.map(e=>e.title)).toEqual(["Tidigare","Senare"]);expect(model.summary.totalCostOre).toBe("30");
  expect(JSON.stringify(raw)).not.toMatch(/SECRET_NOTE|DELETED_TITLE|created_by_user_id|11111111/);
});
it("exports only active service intervals and never custom reminders",async()=>{
  await asUser(a,async()=>{
    await db.query("select save_service_interval($1,'Aktiv plan','oil',3000)",[v]);
    const id=(await db.query<{id:string}>("select save_service_interval($1,'INACTIVE_PLAN','oil',3000) as id",[v])).rows[0].id;
    await db.query("select deactivate_service_interval($1,$2)",[v,id]);
    await db.query("select create_custom_reminder($1,'PRIVATE_INSURANCE',current_date)",[v]);
  });
  const raw=await asUser(a,snapshot);expect(createVehicleExportModel(raw).intervals).toEqual([{name:"Aktiv plan",due_date:null,due_mileage:null,urgency:"unknown"}]);
  expect(JSON.stringify(raw)).not.toMatch(/INACTIVE_PLAN|PRIVATE_INSURANCE|user_id|ownership/);
});
it("document indicators obey transfer grants, soft deletion and pending lifecycle without metadata",async()=>{
  const eventIds=(await db.query<{id:string}>("select id from service_events where vehicle_id=$1 and deleted_at is null order by event_date",[v])).rows.map(e=>e.id);
  const documents: {id:string;storage_path:string}[]=[];
  for(const eventId of eventIds){
    const doc=await asUser(a,async()=>(await db.query<{id:string;storage_path:string}>("select * from create_document($1,'PRIVATE_NAME.pdf','application/pdf',100,'receipt',$2)",[v,eventId])).rows[0]);
    documents.push(doc);
  }
  expect(createVehicleExportModel(await asUser(a,snapshot)).events.map(e=>e.has_document)).toEqual([false,false]);
  for(const doc of documents){await db.query("insert into storage.objects(bucket_id,name,metadata) values('vehicle_documents',$1,'{\"size\":100,\"mimetype\":\"application/pdf\"}')",[doc.storage_path]);await asUser(a,()=>db.query("select finalize_document($1,$2)",[v,doc.id]));}
  expect(createVehicleExportModel(await asUser(a,snapshot)).events.map(e=>e.has_document)).toEqual([true,true]);
  const transfer=await asUser(a,async()=>(await db.query<{token:string}>("select * from create_vehicle_transfer($1,$2)",[v,[documents[0].id]])).rows[0]);
  await asUser(b,()=>db.query("select accept_vehicle_transfer($1)",[createHash("sha256").update(transfer.token).digest("hex")]));
  expect(await asUser(a,snapshot)).toBeNull();const raw=await asUser(b,snapshot);
  expect(createVehicleExportModel(raw).events.map(e=>e.has_document)).toEqual([true,false]);
  expect(JSON.stringify(raw)).not.toMatch(/PRIVATE_NAME|storage_path|uploaded_by|from_user|to_user|11111111|22222222/);
  await asUser(b,()=>db.query("select soft_delete_document($1,$2)",[v,documents[0].id]));
  expect(createVehicleExportModel(await asUser(b,snapshot)).events.map(e=>e.has_document)).toEqual([false,false]);
});
it("returns more than 1000 events in one scalar snapshot with stable chronology",async()=>{
  await db.query("insert into service_events(vehicle_id,created_by_user_id,category,title,event_date) select $1,$2,'service','Historik '||n,date '2021-01-01'+n from generate_series(1,1005) n",[v,b]);
  const model=createVehicleExportModel(await asUser(b,snapshot));expect(model.events).toHaveLength(1007);
  expect(model.events[0].title).toBe("Tidigare");expect(model.events.at(-1)?.title).toBe("Senare");
});
