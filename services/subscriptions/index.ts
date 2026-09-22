import "server-only";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createReadOnlyClient } from "@/lib/supabase/server";

const overviewSchema = z.object({
  plan: z.enum(["free", "premium"]), status: z.string(), current_period_end: z.string().nullable(),
  cancel_at_period_end: z.boolean(), has_customer: z.boolean(),
  limits: z.object({ vehicles: z.number().nullable(), document_bytes: z.number() }),
  vehicle_count: z.number(), document_bytes: z.number(),
});
export async function getBillingOverview() {
  await requireUser();
  const db = await createReadOnlyClient();
  const { data, error } = await db.rpc("get_billing_overview");
  if (error) throw new Error("Billing unavailable");
  return overviewSchema.parse(data);
}
export async function getUserPlan() { return (await getBillingOverview()).plan; }
export class PremiumRequiredError extends Error {
  constructor() { super("PDF-export kräver Premium."); }
}
export async function requirePremiumUser() {
  if (await getUserPlan() !== "premium") throw new PremiumRequiredError();
}
