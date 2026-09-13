import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const db = new PGlite();
const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
let vehicleA: string, vehicleB: string, eventA: string, eventB: string;
type Reservation = { id: string; storage_path: string };
async function asUser<T>(id: string, operation: () => Promise<T>) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('test.storage_operation','object.sign',false)", [id]);
  try { return await operation(); } finally { await db.exec("reset role"); }
}
async function reserve(vehicle = vehicleA, event: string | null = eventA) {
  return (await db.query<Reservation>("select * from public.create_document($1,'kvitto.pdf','application/pdf',100,'receipt',$2)", [vehicle,event])).rows[0];
}
async function upload(d: Reservation, size = 100, mime = "application/pdf") {
  await db.query("insert into storage.objects(bucket_id,name,metadata) values ('vehicle_documents',$1,$2)", [d.storage_path,JSON.stringify({size,mimetype:mime})]);
}
async function finalize(d: Reservation, vehicle = vehicleA) { await db.query("select public.finalize_document($1,$2)", [vehicle,d.id]); }
async function remove(d: Reservation) { await db.query("select public.soft_delete_document($1,$2)", [vehicleA,d.id]); }
beforeAll(async () => {
  // SQL/RLS runs in real PostgreSQL/WASM. Auth and Storage API contracts are fixtures.
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$ select current_setting('test.storage_operation',true)=any($1) $$;
    grant usage on schema public,auth,storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated,anon;`);
  for (const migration of ["20260913000100_profiles.sql","20260913000200_vehicles.sql","20260913000300_service_history.sql","20260913000400_documents.sql"]) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${migration}`,import.meta.url),"utf8"));
  }
  await db.query("insert into auth.users values($1),($2)",[a,b]);
  vehicleA = await asUser(a, async () => (await db.query<{ id: string }>("select public.create_vehicle('car','Volvo','V60') as id")).rows[0].id);
  vehicleB = await asUser(b, async () => (await db.query<{ id: string }>("select public.create_vehicle('car','Saab','900') as id")).rows[0].id);
  eventA = await asUser(a, async () => (await db.query<{ id: string }>("select public.create_service_event($1,'service','Service',current_date) as id",[vehicleA])).rows[0].id);
  eventB = await asUser(b, async () => (await db.query<{ id: string }>("select public.create_service_event($1,'service','Service',current_date) as id",[vehicleB])).rows[0].id);
},30000);
afterAll(()=>db.close());

describe("private documents and Storage RLS",()=>{
  it("creates a private bucket with size/MIME restrictions",async()=>{
    expect((await db.query("select public,file_size_limit,allowed_mime_types from storage.buckets")).rows).toEqual([{public:false,file_size_limit:15728640,allowed_mime_types:["application/pdf","image/jpeg","image/png"]}]);
  });
  it("reserves metadata from auth.uid with a generated path, invisible until upload/finalize",async()=>{
    const d=await asUser(a,()=>reserve());
    expect(d.storage_path).toBe(`${vehicleA}/${d.id}/original`);expect(d.storage_path).not.toContain("kvitto");
    expect((await db.query("select uploaded_by_user_id,visibility_scope,upload_status from public.documents where id=$1",[d.id])).rows[0]).toEqual({uploaded_by_user_id:a,visibility_scope:"private",upload_status:"pending"});
    await asUser(a,async()=>{
      expect((await db.query("select id from public.documents where id=$1",[d.id])).rows).toEqual([]);
      await expect(finalize(d)).rejects.toThrow("Upload metadata mismatch");
      await upload(d);
      expect((await db.query("select name from storage.objects where name=$1",[d.storage_path])).rows).toEqual([]);
      await finalize(d);await finalize(d); // Completion can be retried after network loss.
      expect((await db.query("select id from public.documents where id=$1",[d.id])).rows).toEqual([{id:d.id}]);
      expect((await db.query("select name from storage.objects where name=$1",[d.storage_path])).rows).toEqual([{name:d.storage_path}]);
    });
  });
  it("denies other users' reservations, metadata, links, storage and authorization checks",async()=>{
    const d=await asUser(a,()=>reserve());await asUser(a,async()=>{await upload(d);await finalize(d);});
    await asUser(b,async()=>{
      await expect(reserve()).rejects.toMatchObject({code:"42501"});
      expect((await db.query("select * from public.documents where id=$1",[d.id])).rows).toEqual([]);
      expect((await db.query("select * from public.service_event_documents where document_id=$1",[d.id])).rows).toEqual([]);
      expect((await db.query("select * from storage.objects where name=$1",[d.storage_path])).rows).toEqual([]);
      expect((await db.query("select public.document_object_access($1,'read') as access",[d.storage_path])).rows).toEqual([{access:false}]);
      await expect(remove(d)).rejects.toMatchObject({code:"42501"});
      await expect(finalize(d)).rejects.toMatchObject({code:"42501"});
    });
  });
  it("denies cross-vehicle links through RPC, privileged SQL and direct client inserts",async()=>{
    await asUser(a,async()=>{await expect(reserve(vehicleA,eventB)).rejects.toMatchObject({code:"42501"});});
    const d=await asUser(a,()=>reserve());
    await expect(db.query("insert into public.service_event_documents values($1,$2,now())",[eventB,d.id])).rejects.toMatchObject({code:"23514"});
    await asUser(a,async()=>{await expect(db.query("insert into public.service_event_documents values($1,$2,now())",[eventA,d.id])).rejects.toMatchObject({code:"42501"});});
  });
  it("validates stored object size and MIME independently of declared metadata",async()=>{
    for(const [size,mime] of [[99,"application/pdf"],[100,"text/html"]] as const){
      const d=await asUser(a,()=>reserve());await upload(d,size,mime);
      await asUser(a,async()=>{await expect(finalize(d)).rejects.toThrow("Upload metadata mismatch");});
    }
  });
  it("rejects invalid types, sizes, filenames and caller-supplied attribution",async()=>{
    await asUser(a,async()=>{
      for(const [name,mime,size] of [["x.pdf","text/html",100],["x.pdf","application/pdf",15728641],["x.pdf","application/pdf",0],["../x.pdf","application/pdf",100]]){
        await expect(db.query("select * from public.create_document($1,$2,$3,$4,'receipt')",[vehicleA,name,mime,size])).rejects.toMatchObject({code:"23514"});
      }
      await expect(db.query("select public.create_document($1,'x.pdf','application/pdf',100,'receipt',user_id=>$2)",[vehicleA,b])).rejects.toThrow();
    });
  });
  it("soft delete hides metadata/links and blocks signing, while permitting only Storage removal",async()=>{
    const d=await asUser(a,()=>reserve());
    await asUser(a,async()=>{
      await upload(d);await finalize(d);await remove(d);
      expect((await db.query("select id from public.documents where id=$1",[d.id])).rows).toEqual([]);
      expect((await db.query("select * from public.service_event_documents where document_id=$1",[d.id])).rows).toEqual([]);
      expect((await db.query("select name from storage.objects where name=$1",[d.storage_path])).rows).toEqual([]);
      expect((await db.query("select public.document_object_access($1,'read') as access",[d.storage_path])).rows).toEqual([{access:false}]);
      await db.query("select set_config('test.storage_operation','object.delete_many',false)");
      expect((await db.query("delete from storage.objects where name=$1 returning name",[d.storage_path])).rows).toEqual([{name:d.storage_path}]);
      await expect(db.query("delete from public.documents where id=$1",[d.id])).rejects.toMatchObject({code:"42501"});
    });
    expect((await db.query("select document_id from public.service_event_documents where document_id=$1",[d.id])).rows).toHaveLength(1);
  });
  it("cleans expired uploads and failed physical removals without hiding confirmed uploads",async()=>{
    const d=await asUser(a,()=>reserve());await upload(d);
    await db.query("update public.documents set created_at=now()-interval '4 hours' where id=$1",[d.id]);
    await asUser(a,async()=>{
      const rows=(await db.query<Reservation>("select * from public.document_cleanup_candidates($1)",[vehicleA])).rows;
      expect(rows).toContainEqual(d);
      await db.query("select public.complete_document_cleanup($1,$2)",[vehicleA,d.id]);
      await db.query("select set_config('test.storage_operation','object.delete_many',false)");
      await db.query("delete from storage.objects where name=$1",[d.storage_path]);
      await db.query("select public.complete_document_cleanup($1,$2)",[vehicleA,d.id]);
      expect((await db.query<Reservation>("select * from public.document_cleanup_candidates($1)",[vehicleA])).rows).not.toContainEqual(d);
    });
    const ready=await asUser(a,()=>reserve());await asUser(a,async()=>{
      await upload(ready);await finalize(ready);
      expect((await db.query("select public.soft_delete_document($1,$2,true) as path",[vehicleA,ready.id])).rows).toEqual([{path:null}]);
    });
  });
  it("prevents arbitrary paths, overwrite and access even with broad existing Storage policies",async()=>{
    await db.exec("create policy test_broad on storage.objects for all to authenticated,anon using(true) with check(true)");
    try{
      const d=await asUser(a,()=>reserve());
      await asUser(a,async()=>{
        await expect(upload({id:d.id,storage_path:vehicleA+'/../evil'})).rejects.toMatchObject({code:"42501"});
        await upload(d);await finalize(d);
        expect((await db.query("update storage.objects set metadata='{}' where name=$1 returning name",[d.storage_path])).rows).toEqual([]);
      });
      await asUser(b,async()=>{expect((await db.query("select name from storage.objects where name=$1",[d.storage_path])).rows).toEqual([]);});
      await db.exec("set role anon");try{expect((await db.query("select * from storage.objects")).rows).toEqual([]);}finally{await db.exec("reset role");}
    }finally{await db.exec("drop policy test_broad on storage.objects");}
  });
  it("ended ownership immediately loses document and Storage access",async()=>{
    const d=await asUser(b,()=>reserve(vehicleB,eventB));await asUser(b,async()=>{await upload(d);await finalize(d,vehicleB);});
    await db.query("update public.vehicle_ownerships set status='ended',ended_at=now() where vehicle_id=$1",[vehicleB]);
    await asUser(b,async()=>{
      expect((await db.query("select * from public.documents where id=$1",[d.id])).rows).toEqual([]);
      expect((await db.query("select * from storage.objects where name=$1",[d.storage_path])).rows).toEqual([]);
      await expect(db.query("select public.soft_delete_document($1,$2)",[vehicleB,d.id])).rejects.toMatchObject({code:"42501"});
    });
  });
});
