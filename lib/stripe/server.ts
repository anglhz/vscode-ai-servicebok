import "server-only";
import Stripe from "stripe";

let client: Stripe | undefined;
export function stripeEnvironment(name: "STRIPE_SECRET_KEY" | "STRIPE_WEBHOOK_SECRET" | "STRIPE_PREMIUM_PRICE_ID") {
  const value = process.env[name];
  if (!value) throw new Error("Billing configuration is missing.");
  return value;
}
export function getStripe() {
  return client ??= new Stripe(stripeEnvironment("STRIPE_SECRET_KEY"), {
    apiVersion: "2026-08-26.dahlia", timeout: 10000, maxNetworkRetries: 1,
  });
}
