import type { PGlite } from "@electric-sql/pglite";

// Model the trusted server transport without granting clients the internal RPCs.
// The lifecycle suites exercise unchanged core authorization via the new wrapper.
export async function transferServer(db: PGlite, action: "preview" | "accept", digest: string, columns = "*") {
  const user = (await db.query<{ id: string }>("select auth.uid() as id")).rows[0].id;
  await db.exec("set role service_role");
  try { return await db.query<Record<string, unknown>>(`select ${columns} from public.server_${action}_vehicle_transfer($1,$2)`, [user, digest]); }
  finally { await db.exec("set role authenticated"); }
}
