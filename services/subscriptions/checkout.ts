import "server-only";
import type Stripe from "stripe";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { getAppUrl } from "@/lib/auth/app-url";
import { getStripe, stripeEnvironment } from "@/lib/stripe/server";
import { updateBillingOperation, withBillingLease, type BillingOperation } from "./backend";

function hostedUrl(value: string | null, hostname: string) {
  if (!value) throw new Error("Missing billing URL");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== hostname || url.username || url.password) throw new Error("Invalid billing URL");
  return url.href;
}
async function portal(customer: string, origin: string) {
  const session = await getStripe().billingPortal.sessions.create({ customer, return_url: `${origin}/account` });
  return hostedUrl(session.url, "billing.stripe.com");
}
export async function startPortal() {
  const user = await requireUser();
  await enforceRateLimit("billing_portal");
  const origin = getAppUrl();
  return withBillingLease(user.id, async (_operation, customer) => {
    if (!customer) throw new Error("No billing customer");
    return portal(customer, origin);
  });
}
function checkoutParameters(userId: string, customer: string, operation: BillingOperation): Stripe.Checkout.SessionCreateParams {
  if (!operation.checkout_key || !operation.checkout_price_id || !operation.checkout_origin || !operation.checkout_expires_at) throw new Error("Missing checkout operation");
  return {
    mode: "subscription", customer, line_items: [{ price: operation.checkout_price_id, quantity: 1 }],
    client_reference_id: userId, metadata: { user_id: userId, operation: operation.checkout_key },
    subscription_data: { metadata: { user_id: userId } },
    success_url: `${operation.checkout_origin}/account?checkout=success`, cancel_url: `${operation.checkout_origin}/account?checkout=cancelled`,
    expires_at: operation.checkout_expires_at,
  };
}
export async function startCheckout(plan: unknown) {
  const user = await requireUser();
  if (plan !== "monthly" && plan !== "yearly") throw new Error("Invalid billing plan");
  await enforceRateLimit("billing_checkout");
  const origin = getAppUrl(), price = stripeEnvironment(plan === "monthly" ? "STRIPE_PREMIUM_MONTHLY_PRICE_ID" : "STRIPE_PREMIUM_YEARLY_PRICE_ID"), stripe = getStripe();
  return withBillingLease(user.id, async (initial, savedCustomer) => {
    let operation = initial, customer = savedCustomer;
    if (!customer) {
      operation = await updateBillingOperation(user.id, operation.lease_token, "customer_start", {});
      if (!operation.customer_started_at) throw new Error("Customer attempt not started");
      // Stripe may prune idempotency keys after 24h. Ambiguous old attempts need
      // reconciliation, never an automatic second Customer.
      if (Date.now() - Date.parse(operation.customer_started_at) > 23 * 3600000) throw new Error("Customer reconciliation required");
      customer = (await stripe.customers.create({ metadata: { user_id: user.id } }, { idempotencyKey: `servicebok-customer:${operation.customer_key}` })).id;
      await updateBillingOperation(user.id, operation.lease_token, "customer", { id: customer });
    }
    const subscriptions = await stripe.subscriptions.list({ customer, status: "all", limit: 100 });
    if (subscriptions.has_more) throw new Error("Subscription reconciliation required");
    if (subscriptions.data.some(s => !["canceled", "incomplete_expired"].includes(s.status))) return portal(customer, origin);

    let existing: Stripe.Checkout.Session | undefined;
    if (operation.checkout_session_id) existing = await stripe.checkout.sessions.retrieve(operation.checkout_session_id);
    else if (operation.checkout_key && (operation.checkout_expires_at ?? 0) <= Date.now() / 1000) {
      // Recover a response lost before persisting the session ID.
      const sessions = await stripe.checkout.sessions.list({ customer, limit: 100 });
      if (sessions.has_more) throw new Error("Checkout reconciliation required");
      existing = sessions.data.find(s => s.metadata?.operation === operation.checkout_key);
    }
    // Recover an ambiguous attempt with its original key/parameters before switching.
    if (!existing && operation.checkout_key && operation.checkout_price_id !== price && (operation.checkout_expires_at ?? 0) > Date.now() / 1000) {
      existing = await stripe.checkout.sessions.create(checkoutParameters(user.id, customer, operation), {
        idempotencyKey: "servicebok-checkout:" + operation.checkout_key,
      });
      await updateBillingOperation(user.id, operation.lease_token, "session", { id: existing.id });
    }
    if (existing) {
      const existingCustomer = typeof existing.customer === "string" ? existing.customer : existing.customer?.id;
      if (existingCustomer !== customer) throw new Error("Customer mismatch");
      if (existing.status === "open") {
        if (operation.checkout_price_id === price) return hostedUrl(existing.url, "checkout.stripe.com");
        // A successful expire is required before allocating a new key. If payment
        // wins the race or Stripe is unavailable, fail closed and retry/reconcile.
        existing = await stripe.checkout.sessions.expire(existing.id);
        if (existing.status !== "expired") throw new Error("Checkout reconciliation required");
      }
      if (existing.status === "complete" && subscriptions.data.length === 0) return `${origin}/account?checkout=success`;
    }
    if (!operation.checkout_key || existing?.status === "expired" || existing?.status === "complete" || (operation.checkout_expires_at ?? 0) <= Date.now() / 1000) {
      operation = await updateBillingOperation(user.id, operation.lease_token, "checkout", { price, origin });
    }
    const session = await stripe.checkout.sessions.create(checkoutParameters(user.id, customer, operation), {
      idempotencyKey: `servicebok-checkout:${operation.checkout_key}`,
    });
    await updateBillingOperation(user.id, operation.lease_token, "session", { id: session.id });
    if (session.status === "complete") return `${origin}/account?checkout=success`;
    return hostedUrl(session.url, "checkout.stripe.com");
  });
}
