import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const db = new PGlite();

beforeAll(async () => {
  // Minimal Auth contract; PGlite runs real PostgreSQL RLS and triggers, not GoTrue.
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('${a}');`);
  await db.exec(readFileSync(new URL("../supabase/migrations/20260913000100_profiles.sql", import.meta.url), "utf8"));
  await db.exec(`insert into auth.users values ('${b}');`);
}, 30000);
afterAll(() => db.close());

async function asUser<T>(id: string, operation: () => Promise<T>) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
  try { return await operation(); } finally { await db.exec("reset role;"); }
}

describe("profiles migration and RLS", () => {
  it("backfills existing accounts and creates new profiles with defaults", async () => {
    const result = await db.query("select id, preferred_locale, timezone from public.profiles order by id");
    expect(result.rows).toEqual([a, b].map(id => ({ id, preferred_locale: "sv", timezone: "Europe/Stockholm" })));
  });
  it("A sees only A; B sees only B", async () => {
    for (const id of [a, b]) await asUser(id, async () => {
      expect((await db.query("select id from public.profiles")).rows).toEqual([{ id }]);
    });
  });
  it("A cannot select or modify B, even using direct SQL", async () => {
    await asUser(a, async () => {
      expect((await db.query("select * from public.profiles where id = $1", [b])).rows).toEqual([]);
      expect((await db.query("update public.profiles set display_name = 'attack' where id = $1 returning id", [b])).rows).toEqual([]);
    });
  });
  it("allows own profile changes and updates timestamp", async () => {
    const before = (await db.query<{ updated_at: string }>("select updated_at from public.profiles where id = $1", [a])).rows[0].updated_at;
    await asUser(a, async () => {
      const result = await db.query<{ display_name: string; updated_at: string }>("update public.profiles set display_name = 'Anna' where id = $1 returning display_name, updated_at", [a]);
      expect(result.rows[0].display_name).toBe("Anna");
      expect(result.rows[0].updated_at).not.toEqual(before);
    });
  });
  it("denies identity changes, client inserts, deletes and timestamp tampering", async () => {
    await asUser(a, async () => {
      for (const sql of [
        `update public.profiles set id = '${b}' where id = '${a}'`,
        `insert into public.profiles(id) values ('33333333-3333-4333-8333-333333333333')`,
        `delete from public.profiles where id = '${a}'`,
        `update public.profiles set created_at = now() where id = '${a}'`,
        `update public.profiles set updated_at = now() where id = '${a}'`,
      ]) await expect(db.exec(sql)).rejects.toThrow();
    });
  });
  it("denies anonymous profile reads", async () => {
    await db.exec("set role anon;");
    try { await expect(db.query("select * from public.profiles")).rejects.toThrow(); }
    finally { await db.exec("reset role;"); }
  });
});
