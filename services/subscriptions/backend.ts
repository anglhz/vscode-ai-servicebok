import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const operationSchema = z.object({
  lease_token: z.string().nullable(), customer_key: z.string(), customer_started_at: z.string(),
  checkout_key: z.string().nullable(), checkout_expires_at: z.number().nullable(),
  checkout_price_id: z.string().nullable(), checkout_origin: z.string().nullable(), checkout_session_id: z.string().nullable(),
});
export type BillingOperation = z.infer<typeof operationSchema>;
const acquiredSchema = z.object({ operation: operationSchema, subscription: z.object({ stripe_customer_id: z.string().nullable() }) });

// All service-role access is confined to this backend and its server-only factory.
export async function withBillingLease<T>(userId: string, work: (operation: BillingOperation, customer: string | null) => Promise<T>) {
  const db = createAdminClient();
  const { data, error } = await db.rpc("billing_acquire", { p_user_id: userId });
  if (error) throw new Error("Billing busy");
  const acquired = acquiredSchema.parse(data);
  try { return await work(acquired.operation, acquired.subscription.stripe_customer_id); }
  finally {
    await db.rpc("billing_operation", { p_user_id: userId, p_lease: acquired.operation.lease_token, p_action: "release" });
  }
}
export async function updateBillingOperation(userId: string, lease: string | null, action: string, value: Record<string, string>) {
  const { data, error } = await createAdminClient().rpc("billing_operation", {
    p_user_id: userId, p_lease: lease, p_action: action, p_value: value,
  });
  if (error) throw new Error("Billing operation failed");
  return operationSchema.parse(data);
}
export async function findBillingUser(customer: string) {
  const { data, error } = await createAdminClient().from("subscriptions").select("user_id").eq("stripe_customer_id", customer).maybeSingle();
  if (error) throw new Error("Billing lookup failed");
  return data ? z.string().uuid().parse(data.user_id) : null;
}
export async function wasEventProcessed(id: string) {
  const { data, error } = await createAdminClient().from("stripe_webhook_events").select("stripe_event_id").eq("stripe_event_id", id).maybeSingle();
  if (error) throw new Error("Billing lookup failed");
  return Boolean(data);
}
export async function applySubscription(userId: string, lease: string | null, event: { id: string; type: string; created: number }, state: Record<string, string | boolean | null>) {
  const { error } = await createAdminClient().rpc("apply_stripe_subscription", {
    p_user_id: userId, p_lease: lease, p_event_id: event.id, p_event_type: event.type,
    p_event_created_at: new Date(event.created * 1000).toISOString(), p_state: state,
  });
  if (error) throw new Error("Subscription synchronization failed");
}
