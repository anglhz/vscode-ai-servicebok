import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const db = new PGlite({ extensions: { pgcrypto } });
const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222", c = "33333333-3333-4333-8333-333333333333";
type Transfer = { id: string; token: string; expires_at: Date };
type Document = { id: string; storage_path: string };
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
async function asUser<T>(user: string, fn: () => Promise<T>) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('test.storage_operation','object.sign',false)", [user]);
  try { return await fn(); } finally { await db.exec("reset role"); }
}
async function vehicle() { return asUser(a, async () => (await db.query<{ id: string }>("select create_vehicle('car','Volvo','V60',p_current_mileage=>10000) as id")).rows[0].id); }
async function start(v: string, docs: string[] = []) { return (await db.query<Transfer>("select * from create_vehicle_transfer($1,$2)", [v, docs])).rows[0]; }
async function accept(t: Transfer) { return db.query("select accept_vehicle_transfer($1)", [hash(t.token)]); }
async function document(v: string, ready = true) {
  const d = await asUser(a, async () => (await db.query<Document>("select * from create_document($1,'privat.pdf','application/pdf',100,'receipt')", [v])).rows[0]);
  if (ready) {
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('vehicle_documents',$1,'{\"size\":100,\"mimetype\":\"application/pdf\"}')", [d.storage_path]);
    await asUser(a, () => db.query("select finalize_document($1,$2)", [v, d.id]));
  }
  return d;
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$ select current_setting('test.storage_operation',true)=any($1) $$;
    grant usage on schema public,auth,storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated,anon;`);
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(file, dir), "utf8"));
  await db.query("insert into auth.users values($1),($2),($3)", [a,b,c]);
}, 30000);
afterAll(() => db.close());

describe("vehicle transfer capabilities and lifecycle", () => {
  it("only the active owner can start; anon and an empty identity cannot call it", async () => {
    const v = await vehicle();
    for (const user of [b,c,""]) await asUser(user, async () => { await expect(start(v)).rejects.toMatchObject({ code: "42501" }); });
    await db.exec("set role anon");
    try { await expect(start(v)).rejects.toMatchObject({ code: "42501" }); } finally { await db.exec("reset role"); }
    expect((await asUser(a, () => start(v))).id).toBeTruthy();
  });
  it("generates distinct 256-bit tokens, stores only SHA-256, expires in seven days and hides hash from sellers", async () => {
    const v = await vehicle(), other = await vehicle();
    const t = await asUser(a, () => start(v)), t2 = await asUser(a, () => start(other));
    expect(t.token).toMatch(/^[0-9a-f]{64}$/); expect(t2.token).not.toBe(t.token);
    const row = (await db.query<{ token_hash: string; seconds: number }>("select token_hash,extract(epoch from (expires_at-created_at))::float as seconds from vehicle_transfers where id=$1", [t.id])).rows[0];
    expect(row.token_hash).toBe(hash(t.token)); expect(row.token_hash).not.toBe(t.token); expect(row.seconds).toBeCloseTo(604800, 0);
    expect(JSON.stringify((await db.query("select to_jsonb(t) from vehicle_transfers t where id=$1", [t.id])).rows)).not.toContain(t.token);
    await asUser(a, async () => { await expect(db.query("select token_hash from vehicle_transfers")).rejects.toMatchObject({ code: "42501" }); });
  });
  it("enforces one pending transfer per vehicle and permits a new one after cancellation", async () => {
    const v = await vehicle(); const t = await asUser(a, () => start(v));
    await asUser(a, async () => {
      await expect(start(v)).rejects.toMatchObject({ code: "23505" });
      await db.query("select cancel_vehicle_transfer($1,$2)", [v,t.id]);
      expect((await start(v)).id).not.toBe(t.id);
    });
  });
  it("rejects incorrect tokens without revealing a transfer", async () => {
    await asUser(b, async () => {
      expect((await db.query("select * from preview_vehicle_transfer($1)", ["0".repeat(64)])).rows).toEqual([]);
      await expect(db.query("select accept_vehicle_transfer($1)", ["0".repeat(64)])).rejects.toMatchObject({ code: "42501" });
    });
  });
  it("rejects expired capabilities and lazily expires the old row when starting again", async () => {
    const v = await vehicle(), t = await asUser(a, () => start(v));
    await db.query("update vehicle_transfers set created_at=now()-interval '8 days',expires_at=now()-interval '1 day' where id=$1", [t.id]);
    await asUser(b, async () => {
      await expect(accept(t)).rejects.toMatchObject({ code: "42501" });
      expect((await db.query("select status,make from preview_vehicle_transfer($1)", [hash(t.token)])).rows).toEqual([{ status: "expired", make: null }]);
    });
    await asUser(a, () => start(v));
    expect((await db.query("select status from vehicle_transfers where id=$1", [t.id])).rows).toEqual([{ status: "expired" }]);
  });
  it("cancellation invalidates the token and only the seller can cancel", async () => {
    const v = await vehicle(), t = await asUser(a, () => start(v));
    await asUser(b, async () => { await expect(db.query("select cancel_vehicle_transfer($1,$2)", [v,t.id])).rejects.toMatchObject({ code: "42501" }); });
    await asUser(a, () => db.query("select cancel_vehicle_transfer($1,$2)", [v,t.id]));
    await asUser(b, async () => { await expect(accept(t)).rejects.toMatchObject({ code: "42501" }); });
    expect((await db.query("select status,cancelled_at is not null as stamped from vehicle_transfers where id=$1", [t.id])).rows).toEqual([{ status: "cancelled", stamped: true }]);
  });
  it("seller cannot accept their own transfer", async () => {
    const v = await vehicle(), transfer = await asUser(a, () => start(v));
    await asUser(a, async () => { await expect(accept(transfer)).rejects.toMatchObject({ code: "42501" }); });
  });
  it("B accepts A once, ends the old ownership, preserves history and cannot cancel acceptance", async () => {
    const v = await vehicle(), t = await asUser(a, () => start(v));
    const original = (await db.query<{id:string}>("select id from vehicle_ownerships where vehicle_id=$1", [v])).rows[0];
    await asUser(b, () => accept(t));
    const rows = (await db.query("select id,user_id,status,ended_at is not null as ended from vehicle_ownerships where vehicle_id=$1 order by started_at", [v])).rows;
    expect(rows).toEqual([{ ...original,user_id:a,status:"ended",ended:true },{ id:expect.any(String),user_id:b,status:"active",ended:false }]);
    expect((await db.query("select status,to_user_id,accepted_at is not null as stamped from vehicle_transfers where id=$1", [t.id])).rows).toEqual([{status:"accepted",to_user_id:b,stamped:true}]);
    for (const user of [b,c]) await asUser(user, async () => { await expect(accept(t)).rejects.toMatchObject({code:"42501"}); });
    await asUser(b, async () => { await expect(db.query("select cancel_vehicle_transfer($1,$2)", [v,t.id])).rejects.toMatchObject({code:"42501"}); });
  });
  it("requires the same source ownership period even if a former owner later returns", async () => {
    const v = await vehicle(), t = await asUser(a, () => start(v));
    await db.query("update vehicle_ownerships set status='ended',ended_at=now() where vehicle_id=$1;", [v]);
    await db.query("insert into vehicle_ownerships(vehicle_id,user_id) values($1,$2)", [v,a]);
    await asUser(b, async () => { await expect(accept(t)).rejects.toMatchObject({code:"42501"}); });
  });
  it("rejects direct writes, recipient table reads and anonymous token preview", async () => {
    const v = await vehicle(), t = await asUser(a, () => start(v));
    for (const user of [a,b,c]) await asUser(user, async () => {
      for (const query of ["delete from vehicle_transfers", "update vehicle_transfers set status='expired'", "delete from vehicle_transfer_documents", "insert into vehicle_transfers default values", "insert into vehicle_transfer_documents default values"])
        await expect(db.query(query)).rejects.toMatchObject({code:"42501"});
      expect((await db.query("select id from vehicle_transfers where id=$1", [t.id])).rows).toEqual(user === a ? [{id:t.id}] : []);
    });
    await db.exec("set role anon");
    try { await expect(db.query("select * from preview_vehicle_transfer($1)", [hash(t.token)])).rejects.toMatchObject({code:"42501"}); }
    finally { await db.exec("reset role"); }
  });
  it("preview returns only basic vehicle fields, expiry, status, document count and self flag", async () => {
    const v = await vehicle(), d = await document(v), t = await asUser(a, () => start(v,[d.id]));
    const rows = await asUser(b, () => db.query<Record<string,unknown>>("select * from preview_vehicle_transfer($1)", [hash(t.token)]));
    expect(Object.keys(rows.rows[0]).sort()).toEqual(["document_count","expires_at","is_sender","make","model","registration_number","status"]);
    expect(rows.rows[0]).toMatchObject({document_count:1,make:"Volvo",is_sender:false});
  });
  it("rolls back ownership, transfer and reminders together if the final mutation fails", async () => {
    const v = await vehicle();
    await asUser(a, () => db.query("select save_service_interval($1,'Olja','oil',3000)", [v]));
    const t = await asUser(a, () => start(v));
    await db.exec("create function public.test_fail_reminder() returns trigger language plpgsql as $$ begin raise exception 'forced rollback'; end $$; create trigger test_fail before update on reminders for each row execute function public.test_fail_reminder();");
    try { await asUser(b, async () => { await expect(accept(t)).rejects.toThrow("forced rollback"); }); }
    finally { await db.exec("drop trigger test_fail on reminders; drop function public.test_fail_reminder();"); }
    expect((await db.query("select user_id,status from vehicle_ownerships where vehicle_id=$1", [v])).rows).toEqual([{user_id:a,status:"active"}]);
    expect((await db.query("select status from vehicle_transfers where id=$1", [t.id])).rows).toEqual([{status:"pending"}]);
  });
});

describe("history, reminders and explicit private document grants", () => {
  it("revokes A immediately; B receives unchanged vehicle/event/mileage/interval and C has no access", async () => {
    const v = await vehicle();
    await asUser(a, () => db.query("select create_service_event($1,'service','Service',current_date,11000)", [v]));
    await asUser(a, () => db.query("select save_service_interval($1,'Olja','oil',3000)", [v]));
    await asUser(a, () => db.query("select create_custom_reminder($1,'Min försäkring',current_date)", [v]));
    const before = (await db.query("select id,current_mileage from vehicles where id=$1", [v])).rows;
    const transfer = await asUser(a, () => start(v));
    await asUser(b, () => accept(transfer));
    // Explicitly reset identity: each subsequent query must exercise the requested user's RLS.
    for (const user of [a,b,c]) await asUser(user, async () => {
      for (const table of ["vehicles","service_events","mileage_entries","service_intervals","reminders"]) {
        const rows = (await db.query(`select id from ${table} where ${table === "vehicles" ? "id" : "vehicle_id"}=$1`, [v])).rows;
        expect(rows.length > 0).toBe(user === b);
      }
      if (user !== b) await expect(db.query("select create_service_event($1,'service','Denied',current_date)", [v])).rejects.toMatchObject({code:"42501"});
    });
    expect((await db.query("select id,current_mileage from vehicles where id=$1", [v])).rows).toEqual(before);
    expect((await db.query("select user_id,status from reminders where vehicle_id=$1 and service_interval_id is null", [v])).rows).toEqual([{user_id:a,status:"dismissed"}]);
    expect((await db.query("select user_id from reminders where vehicle_id=$1 and service_interval_id is not null", [v])).rows).toEqual([{user_id:b}]);
    await asUser(b, () => db.query("select save_service_interval($1,'Ny plan','oil',2000,null,null,null,(select id from service_intervals where vehicle_id=$1))", [v]));
  });
  it("default transfer carries no private documents or event links", async () => {
    const v = await vehicle(), d = await document(v), t = await asUser(a, () => start(v));
    const event = await asUser(a, async () => (await db.query<{id:string}>("select create_service_event($1,'service','Linked receipt',current_date) as id", [v])).rows[0].id);
    await db.query("insert into service_event_documents(service_event_id,document_id) values($1,$2)", [event,d.id]);
    await asUser(b, () => accept(t));
    await asUser(b, async () => { expect((await db.query("select id from documents where vehicle_id=$1", [v])).rows).toEqual([]); expect((await db.query("select document_object_access($1,'read') as access", [d.storage_path])).rows).toEqual([{access:false}]); });
    await asUser(b, async () => { expect((await db.query("select document_id from service_event_documents where service_event_id=$1", [event])).rows).toEqual([]); });
  });
  it("only selected documents and Storage paths are readable by B, with unchanged private visibility", async () => {
    const v = await vehicle(), chosen = await document(v), hidden = await document(v), t = await asUser(a, () => start(v,[chosen.id]));
    const event = await asUser(a, async () => (await db.query<{id:string}>("select create_service_event($1,'service','Linked receipts',current_date) as id", [v])).rows[0].id);
    await db.query("insert into service_event_documents(service_event_id,document_id) values($1,$2),($1,$3)", [event,chosen.id,hidden.id]);
    await asUser(b, () => accept(t));
    for (const user of [a,b,c]) await asUser(user, async () => {
      expect((await db.query("select id from documents where vehicle_id=$1", [v])).rows).toEqual(user === b ? [{id:chosen.id}] : []);
      expect((await db.query("select document_id from service_event_documents where service_event_id=$1", [event])).rows).toEqual(user === b ? [{document_id:chosen.id}] : []);
      expect((await db.query("select name from storage.objects where name in ($1,$2)", [chosen.storage_path,hidden.storage_path])).rows).toEqual(user === b ? [{name:chosen.storage_path}] : []);
      for (const d of [chosen,hidden]) expect((await db.query("select document_object_access($1,'read') as access", [d.storage_path])).rows).toEqual([{access:user === b && d.id === chosen.id}]);
    });
    expect((await db.query("select distinct visibility_scope from documents where vehicle_id=$1", [v])).rows).toEqual([{visibility_scope:"private"}]);
  });
  it("rejects cross-vehicle, pending, deleted and inaccessible document selections", async () => {
    const v = await vehicle(), other = await vehicle(), d = await document(other), pending = await document(v,false), deleted = await document(v);
    await asUser(a, () => db.query("select soft_delete_document($1,$2)", [v,deleted.id]));
    for (const id of [d.id,pending.id,deleted.id]) await asUser(a, async () => { await expect(start(v,[id])).rejects.toMatchObject({code:"42501"}); });
    const t = await asUser(a, () => start(v)); await asUser(b, () => accept(t));
    await asUser(b, async () => { await expect(start(v,[deleted.id])).rejects.toMatchObject({code:"42501"}); });
    await expect(db.query("insert into vehicle_transfer_documents(transfer_id,document_id) values($1,$2)", [t.id,d.id])).rejects.toMatchObject({code:"23514"});
  });
  it("document deletion after selection cannot resurrect content on acceptance", async () => {
    const v = await vehicle(), d = await document(v), t = await asUser(a, () => start(v,[d.id]));
    await asUser(a, () => db.query("select soft_delete_document($1,$2)", [v,d.id]));
    await asUser(b, () => accept(t));
    await asUser(b, async () => { expect((await db.query("select id from documents where id=$1", [d.id])).rows).toEqual([]); expect((await db.query("select document_object_access($1,'read') as access", [d.storage_path])).rows).toEqual([{access:false}]); });
  });
  it("unselected files cannot be deleted or exposed through cleanup RPCs by the new owner", async () => {
    const v = await vehicle(), d = await document(v), pending = await document(v,false), t = await asUser(a, () => start(v));
    await db.query("update documents set created_at=now()-interval '4 hours' where vehicle_id=$1", [v]);
    await asUser(b, () => accept(t));
    await asUser(b, async () => {
      expect((await db.query("select soft_delete_document($1,$2) as path", [v,d.id])).rows).toEqual([{path:null}]);
      expect((await db.query("select * from document_cleanup_candidates($1)", [v])).rows).toEqual([]);
      await expect(db.query("select finalize_document($1,$2)", [v,pending.id])).rejects.toMatchObject({code:"42501"});
      expect((await db.query("select document_object_access($1,'delete') as access", [d.storage_path])).rows).toEqual([{access:false}]);
    });
    expect((await db.query("select deleted_at from documents where id=$1", [d.id])).rows).toEqual([{deleted_at:null}]);
  });
  it("a later owner gets no inherited documents without fresh opt-in; old grants do not revive when B returns", async () => {
    const v = await vehicle(), d = await document(v), first = await asUser(a, () => start(v,[d.id]));
    await asUser(b, () => accept(first));
    const second = await asUser(b, () => start(v)); await asUser(c, () => accept(second));
    const third = await asUser(c, () => start(v)); await asUser(b, () => accept(third));
    await asUser(b, async () => { expect((await db.query("select id from documents where id=$1", [d.id])).rows).toEqual([]); });
  });
  it("a recipient may explicitly pass a received document to the next ownership", async () => {
    const v = await vehicle(), d = await document(v), first = await asUser(a, () => start(v,[d.id]));
    await asUser(b, () => accept(first));
    const second = await asUser(b, () => start(v,[d.id])); await asUser(c, () => accept(second));
    await asUser(c, async () => { expect((await db.query("select id from documents where id=$1", [d.id])).rows).toEqual([{id:d.id}]); });
  });
});
