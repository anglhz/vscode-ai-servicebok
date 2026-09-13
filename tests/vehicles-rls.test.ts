import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const db = new PGlite();
let vehicleA: string;
let vehicleB: string;
async function asUser<T>(id: string, operation: () => Promise<T>) {
  await db.exec(`set role authenticated;`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  try { return await operation(); } finally { await db.exec("reset role;"); }
}
async function create() {
  return (await db.query<{ id: string }>("select public.create_vehicle('car', ' Volvo ', 'V60', 'abc 123', 2021, 8420, 'ab 123', '') as id")).rows[0].id;
}
beforeAll(async () => {
  // Real PostgreSQL RLS/transactions via WASM; only the Auth contract is stubbed.
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;`);
  for (const name of ["20260913000100_profiles.sql", "20260913000200_vehicles.sql"]) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
  }
  await db.exec(`insert into auth.users values ('${a}'), ('${b}');`);
  vehicleA = await asUser(a, create);
  vehicleB = await asUser(b, create);
}, 30000);
afterAll(() => db.close());

describe("vehicle migration, atomic RPC and RLS", () => {
  it("creates a vehicle and exactly one current ownership from auth.uid", async () => {
    for (const [user, vehicle] of [[a, vehicleA], [b, vehicleB]]) {
      expect((await db.query("select user_id, status, role, ended_at from public.vehicle_ownerships where vehicle_id = $1", [vehicle])).rows)
        .toEqual([{ user_id: user, status: "active", role: "owner", ended_at: null }]);
    }
    expect((await db.query("select make, registration_number, vin, fuel_type, current_mileage from public.vehicles where id = $1", [vehicleA])).rows[0])
      .toEqual({ make: "Volvo", registration_number: "ABC123", vin: "AB123", fuel_type: null, current_mileage: 8420 });
  });
  it("each user sees only their own vehicles and ownerships", async () => {
    for (const [user, vehicle] of [[a, vehicleA], [b, vehicleB]]) await asUser(user, async () => {
      expect((await db.query("select id from public.vehicles")).rows).toEqual([{ id: vehicle }]);
      expect((await db.query("select user_id from public.vehicle_ownerships")).rows).toEqual([{ user_id: user }]);
    });
  });
  it("A cannot read or update B and B cannot read or update A", async () => {
    for (const [user, other] of [[a, vehicleB], [b, vehicleA]]) await asUser(user, async () => {
      expect((await db.query("select * from public.vehicles where id = $1", [other])).rows).toEqual([]);
      expect((await db.query("update public.vehicles set model = 'attack' where id = $1 returning id", [other])).rows).toEqual([]);
    });
  });
  it("allows own updates, normalizes empty identifiers and updates timestamp", async () => {
    const before = (await db.query<{ updated_at: string }>("select updated_at from public.vehicles where id = $1", [vehicleA])).rows[0].updated_at;
    await asUser(a, async () => {
      const result = await db.query<{ registration_number: string | null; vin: string; updated_at: string }>("update public.vehicles set registration_number = '  ', vin = 'xy z', model = 'V60' where id = $1 returning registration_number, vin, updated_at", [vehicleA]);
      expect(result.rows[0]).toMatchObject({ registration_number: null, vin: "XYZ" });
      expect(result.rows[0].updated_at).not.toEqual(before);
    });
  });
  it("denies client ownership mutations and vehicle insert/delete/identity changes", async () => {
    await asUser(a, async () => {
      for (const sql of [
        `insert into public.vehicle_ownerships(vehicle_id, user_id) values ('${vehicleB}', '${a}')`,
        `update public.vehicle_ownerships set user_id = '${b}' where vehicle_id = '${vehicleA}'`,
        `delete from public.vehicle_ownerships where vehicle_id = '${vehicleA}'`,
        "insert into public.vehicles(vehicle_type, make, model) values ('car', 'X', 'Y')",
        `delete from public.vehicles where id = '${vehicleA}'`,
        `update public.vehicles set id = gen_random_uuid() where id = '${vehicleA}'`,
        `update public.vehicles set created_at = now() where id = '${vehicleA}'`,
        `update public.vehicles set external_provider = 'forged' where id = '${vehicleA}'`,
      ]) await expect(db.exec(sql)).rejects.toMatchObject({ code: "42501" });
    });
  });
  it("enforces a unique active owner even for privileged SQL", async () => {
    await expect(db.query("insert into public.vehicle_ownerships(vehicle_id, user_id) values ($1, $2)", [vehicleA, b]))
      .rejects.toMatchObject({ code: "23505" });
  });
  it("has no client user_id argument and denies anonymous or missing identity RPC", async () => {
    await asUser(a, async () => {
      await expect(db.exec(`select public.create_vehicle(p_vehicle_type => 'car', p_make => 'X', p_model => 'Y', user_id => '${b}')`)).rejects.toThrow();
    });
    await asUser("", async () => { await expect(create()).rejects.toMatchObject({ code: "42501" }); });
    await db.exec("set role anon;");
    try {
      await expect(create()).rejects.toMatchObject({ code: "42501" });
      await expect(db.query("select * from public.vehicles")).rejects.toMatchObject({ code: "42501" });
      await expect(db.query("select * from public.vehicle_ownerships")).rejects.toMatchObject({ code: "42501" });
    } finally { await db.exec("reset role;"); }
  });
  it("rolls back the vehicle when ownership insertion fails", async () => {
    const before = (await db.query("select count(*) as n from public.vehicles")).rows;
    // Authenticated identity without a profile forces the second insert's FK to fail.
    await asUser("33333333-3333-4333-8333-333333333333", async () => {
      await expect(create()).rejects.toMatchObject({ code: "23503" });
    });
    expect((await db.query("select count(*) as n from public.vehicles")).rows).toEqual(before);
  });
  it("enforces numeric, name, type and ownership date constraints in PostgreSQL", async () => {
    for (const assignment of ["current_mileage = -1", "power_kw = -1", "model_year = 1885", "vehicle_year = 2101", "make = ''", "model = chr(9)", "vehicle_type = 'invalid'", "vin = repeat('a', 65)"]) {
      await expect(db.exec(`update public.vehicles set ${assignment} where id = '${vehicleA}'`)).rejects.toMatchObject({ code: "23514" });
    }
    await expect(db.exec(`update public.vehicle_ownerships set ended_at = now() where vehicle_id = '${vehicleA}'`)).rejects.toMatchObject({ code: "23514" });
  });
  it("preserves historical ownership but removes vehicle access after ownership ends", async () => {
    const vehicle = await asUser(a, create);
    await db.query("update public.vehicle_ownerships set status = 'ended', ended_at = now() where vehicle_id = $1", [vehicle]);
    await db.query("insert into public.vehicle_ownerships(vehicle_id, user_id) values ($1, $2)", [vehicle, b]);
    await asUser(a, async () => {
      expect((await db.query("select * from public.vehicles where id = $1", [vehicle])).rows).toEqual([]);
      expect((await db.query("update public.vehicles set model = 'old owner' where id = $1 returning id", [vehicle])).rows).toEqual([]);
      expect((await db.query("select status from public.vehicle_ownerships where vehicle_id = $1", [vehicle])).rows).toEqual([{ status: "ended" }]);
    });
    await asUser(b, async () => { expect((await db.query("select id from public.vehicles where id = $1", [vehicle])).rows).toEqual([{ id: vehicle }]); });
  });
});
