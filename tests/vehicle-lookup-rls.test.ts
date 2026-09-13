import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite({ extensions: { pgcrypto } });
const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
const secret = "test-only-signing-secret-32-bytes-long";
const source = { registration_number: "ABC123", vin: "VIN123", make: "Volvo", model: "V60", model_year: 2021, vehicle_year: 2020, fuel_type: "Bensin", power_kw: 145, vehicle_type: "car", first_registration_date: "2020-12-01", color: "Blå", external_provider: "http-json", external_provider_id: "source123" };
function token(user = a, vehicle = source, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ user, vehicle, expires: now + 900000, fetchedAt: new Date(now).toISOString() })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(`vehicle-lookup-v1:${payload}`).digest("base64url")}`;
}
async function asUser<T>(user: string, fn: () => Promise<T>) {
  await db.exec("set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  try { return await fn(); } finally { await db.exec("reset role"); }
}
async function create(reg: string | null = null, vin: string | null = null, receipt: string | null = null) {
  return (await db.query<{ id: string }>("select public.create_vehicle('car','Corrected make','Corrected model',$1,2022,8000,$2,'Bensin',$3) as id", [reg, vin, receipt])).rows[0].id;
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
  for (const name of ["profiles", "vehicles", "service_history", "documents", "vehicle_lookup"]) {
    const index = ["profiles", "vehicles", "service_history", "documents", "vehicle_lookup"].indexOf(name) + 1;
    await db.exec(readFileSync(new URL(`../supabase/migrations/20260913000${index}00_${name}.sql`, import.meta.url), "utf8"));
  }
  await db.query("insert into auth.users values($1),($2)", [a, b]);
  await db.query("insert into private.vehicle_lookup_config(signing_secret) values($1)", [secret]);
}, 30000);
afterAll(() => db.close());

describe("lookup migration and secure creation", () => {
  it("verifies the real Node HMAC in PostgreSQL and caches source fields with atomic ownership/mileage", async () => {
    const receipt = token(); const id = await asUser(a, () => create("abc 123", "vin 123", receipt));
    expect((await db.query("select registration_number,vin,make,model,model_year,vehicle_year,power_kw,color,external_provider,external_provider_id from vehicles where id=$1", [id])).rows[0]).toEqual({ registration_number: "ABC123", vin: "VIN123", make: "Corrected make", model: "Corrected model", model_year: 2022, vehicle_year: 2020, power_kw: 145, color: "Blå", external_provider: "http-json", external_provider_id: "source123" });
    expect((await db.query("select external_data_fetched_at is not null as fetched, first_registration_date::text as first_date from vehicles where id=$1", [id])).rows[0]).toEqual({ fetched: true, first_date: "2020-12-01" });
    expect((await db.query("select user_id from vehicle_ownerships where vehicle_id=$1", [id])).rows).toEqual([{ user_id: a }]);
    expect((await db.query("select mileage,recorded_by_user_id from mileage_entries where vehicle_id=$1", [id])).rows).toEqual([{ mileage: 8000, recorded_by_user_id: a }]);
  });
  it("rejects matching VIN or registration without granting B any access", async () => {
    const before = (await db.query("select count(*) from vehicle_ownerships")).rows;
    await asUser(b, async () => {
      for (const [reg, vin] of [[" abc123 ", "OTHER"], ["OTHER123", "vin 123"]]) await expect(create(reg, vin)).rejects.toMatchObject({ code: "23505" });
      expect((await db.query("select * from vehicles")).rows).toEqual([]);
    });
    expect((await db.query("select count(*) from vehicle_ownerships")).rows).toEqual(before);
  });
  it("allows manual creation without provider configuration or provenance", async () => {
    await db.exec("delete from private.vehicle_lookup_config");
    const id = await asUser(b, () => create());
    expect((await db.query("select external_provider,external_data_fetched_at from vehicles where id=$1", [id])).rows[0]).toEqual({ external_provider: null, external_data_fetched_at: null });
    await asUser(a, async () => { await expect(create("NEW123", "NEWVIN", token(a, { ...source, registration_number: "NEW123", vin: "NEWVIN" }))).rejects.toMatchObject({ code: "22023" }); });
    await db.query("insert into private.vehicle_lookup_config(signing_secret) values($1)", [secret]);
  });
  it("rejects forged, expired, other-user receipts and changed identifiers even through direct RPC", async () => {
    for (const receipt of [token() + "x", token(b), token(a, source, Date.now() - 900001), "invalid", token(a, source, Date.now() + 600000)]) {
      await asUser(a, async () => { await expect(create("ABC123", "VIN123", receipt)).rejects.toMatchObject({ code: "22023" }); });
    }
    await asUser(a, async () => { await expect(create("CHANGED", "VIN123", token())).rejects.toMatchObject({ code: "22023" }); });
  });
  it("does not expose the signing key or verifier to clients, and has no provenance/user-id arguments", async () => {
    await asUser(a, async () => {
      for (const sql of ["select * from private.vehicle_lookup_config", "select public.verify_vehicle_lookup('anything')", "update private.vehicle_lookup_config set signing_secret='attacker'"]) await expect(db.exec(sql)).rejects.toMatchObject({ code: "42501" });
      await expect(db.exec("select public.create_vehicle('car','X','Y',p_external_provider=>'forged')")).rejects.toThrow();
      await expect(db.exec(`select public.create_vehicle('car','X','Y',user_id=>'${b}')`)).rejects.toThrow();
    });
  });
  it("guards direct identifier updates without exposing the matched vehicle", async () => {
    const id = await asUser(b, () => create("XYZ999", "NEWVIN"));
    await asUser(b, async () => {
      await expect(db.query("update vehicles set vin='vin 123' where id=$1", [id])).rejects.toMatchObject({ code: "23505", message: "Vehicle already registered" });
      await expect(db.query("update vehicles set registration_number='abc 123' where id=$1", [id])).rejects.toMatchObject({ code: "23505" });
    });
  });
  it("rolls back creation on missing profile and denies anonymous creation", async () => {
    const before = (await db.query("select count(*) from vehicles")).rows;
    await asUser("33333333-3333-4333-8333-333333333333", async () => { await expect(create()).rejects.toMatchObject({ code: "23503" }); });
    expect((await db.query("select count(*) from vehicles")).rows).toEqual(before);
    await db.exec("set role anon"); try { await expect(create()).rejects.toMatchObject({ code: "42501" }); } finally { await db.exec("reset role"); }
  });
});
