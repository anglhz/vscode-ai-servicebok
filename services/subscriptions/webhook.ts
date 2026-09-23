import "server-only";
import type Stripe from "stripe";
import { getStripe, stripeEnvironment } from "@/lib/stripe/server";
import { applySubscription, findBillingUser, wasEventProcessed, withBillingLease } from "./backend";

function id(value: string | { id: string } | null | undefined) { return typeof value === "string" ? value : value?.id; }
export function subscriptionState(subscription: Stripe.Subscription, userId: string, customer: string) {
  if (id(subscription.customer) !== customer || (subscription.metadata.user_id && subscription.metadata.user_id !== userId)) throw new Error("Customer mismatch");
  const statuses = ["active", "trialing", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"];
  const item = subscription.items.data[0];
  const matches = subscription.items.data.length === 1 && !subscription.items.has_more && item?.quantity === 1 &&
    item.price.recurring?.interval_count === 1 && (
      (item.price.id === stripeEnvironment("STRIPE_PREMIUM_MONTHLY_PRICE_ID") && item.price.recurring.interval === "month") ||
      (item.price.id === stripeEnvironment("STRIPE_PREMIUM_YEARLY_PRICE_ID") && item.price.recurring.interval === "year")
    );
  return {
    id: subscription.id, customer, price: item?.price.id ?? null, price_matches: Boolean(matches),
    status: statuses.includes(subscription.status) ? subscription.status : "inactive",
    created_at: new Date(subscription.created * 1000).toISOString(),
    period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
  };
}
export async function processBillingEvent(event: Stripe.Event) {
  let customer: string | undefined, subscriptionId: string | undefined;
  switch (event.type) {
    case "customer.subscription.created": case "customer.subscription.updated": case "customer.subscription.deleted":
      customer = id(event.data.object.customer); subscriptionId = event.data.object.id; break;
    case "checkout.session.completed":
      customer = id(event.data.object.customer); subscriptionId = id(event.data.object.subscription); break;
    case "invoice.paid": case "invoice.payment_failed":
      customer = id(event.data.object.customer); subscriptionId = id(event.data.object.parent?.subscription_details?.subscription); break;
    default: return;
  }
  if (!customer || !subscriptionId || await wasEventProcessed(event.id)) return;
  const userId = await findBillingUser(customer);
  if (!userId) return; // Other products/customers in the Stripe account confer no access.
  const expectedCustomer = customer, expectedSubscription = subscriptionId;
  await withBillingLease(userId, async (operation, savedCustomer) => {
    if (savedCustomer !== expectedCustomer) throw new Error("Customer mismatch");
    // Read AFTER acquiring the distributed lease. Old notifications therefore
    // synchronize today's Stripe state, and cannot replay their stale payload.
    const subscription = await getStripe().subscriptions.retrieve(expectedSubscription);
    await applySubscription(userId, operation.lease_token, event, subscriptionState(subscription, userId, expectedCustomer));
  });
}
