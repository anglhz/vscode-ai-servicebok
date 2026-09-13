import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
let baselineVehicle: string;
async function asUser<T>(id: string, operation: () => Promise<T>) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  try { return await operation(); } finally { await db.exec("reset role"); }
}
async function vehicle(mileage: number | null = null) {
  return (await db.query<{ id: string }>("select public.create_vehicle('car','Volvo','V60',p_current_mileage => $1) as id", [mileage])).rows[0].id;
}
async function create(v: string, mileage: number | null = null) {
  return (await db.query<{ id: string }>("select public.create_service_event($1,'service',' Service ', '2024-01-01', $2, 429500) as id", [v, mileage])).rows[0].id;
}
async function update(v: string, e: string, mileage: number | null) {
  await db.query("select public.update_service_event($1,$2,'repair','Reparation','2025-02-01',$3, 10000, '', '', '')", [v, e, mileage]);
}
async function remove(v: string, e: string) { await db.query("select public.soft_delete_service_event($1,$2)", [v, e]); }
async function current(v: string) { return (await db.query<{ current_mileage: number | null }>("select current_mileage from public.vehicles where id=$1", [v])).rows[0].current_mileage; }
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;`);
  for (const name of ["20260913000100_profiles.sql", "20260913000200_vehicles.sql"]) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
  }
  await db.query("insert into auth.users values ($1),($2)", [a, b]);
  baselineVehicle = await asUser(a, () => vehicle(12000));
  await db.exec(readFileSync(new URL("../supabase/migrations/20260913000300_service_history.sql", import.meta.url), "utf8"));
}, 30000);
afterAll(() => db.close());

describe("service history PostgreSQL transactions and RLS", () => {
  it("backfills the existing reading and records initial mileage on new vehicles", async () => {
    const v = await asUser(a, () => vehicle(0));
    for (const [id, mileage] of [[baselineVehicle, 12000], [v, 0]]) {
      expect((await db.query("select mileage, source, recorded_by_user_id from public.mileage_entries where vehicle_id=$1", [id])).rows)
        .toEqual([{ mileage, source: "manual", recorded_by_user_id: a }]);
    }
  });
  it("creates as current owner, derives identity, creates linked mileage, and raises current mileage", async () => {
    const v = await asUser(a, () => vehicle(100));
    const e = await asUser(a, () => create(v, 150));
    expect((await db.query("select title, created_by_user_id, source_type, cost_amount from public.service_events where id=$1", [e])).rows[0])
      .toEqual({ title: "Service", created_by_user_id: a, source_type: "owner", cost_amount: 429500 });
    expect((await db.query("select mileage, source, service_event_id from public.mileage_entries where service_event_id=$1", [e])).rows)
      .toEqual([{ mileage: 150, source: "service_event", service_event_id: e }]);
    expect(await current(v)).toBe(150);
  });
  it("does not lower current mileage for historical events and handles absent mileage", async () => {
    await asUser(a, () => create(baselineVehicle, 8500));
    expect(await current(baselineVehicle)).toBe(12000);
    const v = await asUser(a, () => vehicle());
    const e = await asUser(a, () => create(v));
    expect((await db.query("select * from public.mileage_entries where service_event_id=$1", [e])).rows).toEqual([]);
    expect(await current(v)).toBe(null);
  });
  it("edits the same linked row, syncs date, supports removal/readdition and recomputes the maximum", async () => {
    const v = await asUser(a, () => vehicle(100));
    const e = await asUser(a, () => create(v, 200));
    const original = (await db.query<{ id: string }>("select id from public.mileage_entries where service_event_id=$1", [e])).rows[0].id;
    await asUser(a, () => update(v, e, 300)); expect(await current(v)).toBe(300);
    const row = (await db.query<{ id: string; mileage: number; day: string }>("select id, mileage, to_char(recorded_at at time zone 'Europe/Stockholm','YYYY-MM-DD') as day from public.mileage_entries where service_event_id=$1", [e])).rows[0];
    expect(row).toEqual({ id: original, mileage: 300, day: "2025-02-01" });
    await asUser(a, () => update(v, e, 50)); expect(await current(v)).toBe(100);
    await asUser(a, () => update(v, e, null));
    expect((await db.query("select * from public.mileage_entries where service_event_id=$1", [e])).rows).toEqual([]);
    expect(await current(v)).toBe(100);
    await asUser(a, () => update(v, e, 400)); expect(await current(v)).toBe(400);
  });
  it("soft delete hides the event/linked reading, preserves physical rows and recalculates", async () => {
    const v = await asUser(a, () => vehicle(100));
    await asUser(a, () => create(v, 200));
    const e = await asUser(a, () => create(v, 300));
    await asUser(a, () => remove(v, e)); expect(await current(v)).toBe(200);
    await asUser(a, async () => {
      expect((await db.query("select id from public.service_events where id=$1", [e])).rows).toEqual([]);
      expect((await db.query("select id from public.mileage_entries where service_event_id=$1", [e])).rows).toEqual([]);
      await expect(update(v, e, 500)).rejects.toMatchObject({ code: "42501" });
    });
    expect((await db.query("select id from public.mileage_entries where service_event_id=$1", [e])).rows).toHaveLength(1);
    expect((await db.query("select id from public.service_events where id=$1 and deleted_at is not null", [e])).rows).toHaveLength(1);
  });
  it("returns null when the last relevant reading disappears, preserves zero", async () => {
    const v = await asUser(a, () => vehicle());
    const e = await asUser(a, () => create(v, 0)); expect(await current(v)).toBe(0);
    await asUser(a, () => remove(v, e)); expect(await current(v)).toBe(null);
  });
  it("B cannot SELECT/INSERT/UPDATE/delete A's events or readings, including through RPC", async () => {
    const v = await asUser(a, () => vehicle(100)); const e = await asUser(a, () => create(v, 200));
    await asUser(b, async () => {
      for (const table of ["service_events", "mileage_entries"]) {
        expect((await db.query(`select * from public.${table} where vehicle_id=$1`, [v])).rows).toEqual([]);
        await expect(db.query(`delete from public.${table} where vehicle_id=$1`, [v])).rejects.toMatchObject({ code: "42501" });
      }
      await expect(create(v, 999)).rejects.toMatchObject({ code: "42501" });
      await expect(update(v, e, 999)).rejects.toMatchObject({ code: "42501" });
      await expect(remove(v, e)).rejects.toMatchObject({ code: "42501" });
      await expect(db.query("insert into public.service_events(vehicle_id,created_by_user_id,category,title,event_date) values ($1,$2,'service','X',current_date)", [v,b])).rejects.toMatchObject({ code: "42501" });
      await expect(db.query("update public.service_events set title='attack' where id=$1", [e])).rejects.toMatchObject({ code: "42501" });
    });
  });
  it("owners cannot bypass atomic RPC, forge identity, call private helpers or edit current mileage directly", async () => {
    const v = await asUser(a, () => vehicle()); const e = await asUser(a, () => create(v, 200));
    await asUser(a, async () => {
      for (const sql of [
        `delete from public.service_events where id='${e}'`,
        `update public.service_events set vehicle_id='${baselineVehicle}', created_by_user_id='${b}',source_type='system' where id='${e}'`,
        `insert into public.mileage_entries(vehicle_id,recorded_by_user_id,mileage,recorded_at) values ('${v}','${a}',900,now())`,
        `update public.mileage_entries set mileage=900 where vehicle_id='${v}'`,
        `delete from public.mileage_entries where vehicle_id='${v}'`,
        `update public.vehicles set current_mileage=900 where id='${v}'`,
        `select public.sync_service_mileage('${e}')`, `select public.lock_service_vehicle('${v}')`,
      ]) await expect(db.exec(sql)).rejects.toMatchObject({ code: "42501" });
      await expect(db.exec(`select public.create_service_event('${v}','service','X',current_date,user_id=>'${b}')`)).rejects.toThrow();
      await expect(update(baselineVehicle, e, 999)).rejects.toMatchObject({ code: "42501" });
    });
  });
  it("ended ownership loses reading and writing rights; current owner can edit without changing attribution", async () => {
    const v = await asUser(a, () => vehicle()); const e = await asUser(a, () => create(v, 100));
    await db.query("update public.vehicle_ownerships set status='ended',ended_at=now() where vehicle_id=$1", [v]);
    await db.query("insert into public.vehicle_ownerships(vehicle_id,user_id) values ($1,$2)", [v,b]);
    await asUser(a, async () => {
      expect((await db.query("select * from public.service_events where id=$1", [e])).rows).toEqual([]);
      await expect(create(v)).rejects.toMatchObject({ code: "42501" });
      await expect(update(v, e, 300)).rejects.toMatchObject({ code: "42501" });
      await expect(remove(v, e)).rejects.toMatchObject({ code: "42501" });
    });
    await asUser(b, () => update(v, e, 200));
    expect((await db.query("select created_by_user_id,source_type from public.service_events where id=$1", [e])).rows[0]).toEqual({ created_by_user_id:a,source_type:"owner" });
  });
  it("rejects anonymous/missing identity calls and invalid numeric/date input", async () => {
    await asUser("", async () => { await expect(create(baselineVehicle)).rejects.toMatchObject({ code: "42501" }); });
    await db.exec("set role anon");
    try { await expect(create(baselineVehicle)).rejects.toMatchObject({ code: "42501" }); }
    finally { await db.exec("reset role"); }
    await asUser(a, async () => {
      await expect(create(baselineVehicle, -1)).rejects.toMatchObject({ code: "23514" });
      await expect(db.query("select public.create_service_event($1,'bad','X','2025-01-01')", [baselineVehicle])).rejects.toMatchObject({ code: "23514" });
      await expect(db.query("select public.create_service_event($1,'service','X','2025-02-30')", [baselineVehicle])).rejects.toThrow();
    });
  });
  it("rolls back event, linked mileage and current reading if the final update fails", async () => {
    const v = await asUser(a, () => vehicle(100));
    const e = await asUser(a, () => create(v, 200));
    await db.exec(`create function public.test_fail_mileage() returns trigger language plpgsql as $$ begin raise exception 'forced failure'; end $$;
      create trigger test_fail before update on public.vehicles for each row execute function public.test_fail_mileage();`);
    try {
      await asUser(a, async () => {
        await expect(create(v, 500)).rejects.toThrow("forced failure");
        await expect(update(v, e, 600)).rejects.toThrow("forced failure");
        await expect(remove(v, e)).rejects.toThrow("forced failure");
      });
      expect(await current(v)).toBe(200);
      expect((await db.query("select mileage,deleted_at from public.service_events where vehicle_id=$1", [v])).rows).toEqual([{mileage:200,deleted_at:null}]);
      expect((await db.query("select mileage from public.mileage_entries where service_event_id=$1", [e])).rows).toEqual([{mileage:200}]);
    } finally { await db.exec("drop trigger test_fail on public.vehicles; drop function public.test_fail_mileage()"); }
  });
});
