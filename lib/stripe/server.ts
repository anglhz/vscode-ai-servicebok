import "server-only";
import Stripe from "stripe";
import { configurationIssues } from "@/lib/config/validation";

let client: Stripe | undefined;
export function stripeEnvironment(name: "STRIPE_SECRET_KEY" | "STRIPE_WEBHOOK_SECRET" | "STRIPE_PREMIUM_PRICE_ID") {
  const value = process.env[name];
  if (!value) throw new Error("Billing configuration is missing.");
  return value;
}
export function getStripe() {
  const issues = ["app", "supabase", "billing"] as const;
  const errors = issues.flatMap(feature => configurationIssues(feature, process.env));
  if (errors.length) {
    console.error(JSON.stringify({ category: "billing_configuration", issues: errors }));
    throw new Error("Billing configuration is invalid.");
  }
  return client ??= new Stripe(stripeEnvironment("STRIPE_SECRET_KEY"), {
    apiVersion: "2026-08-26.dahlia", timeout: 10000, maxNetworkRetries: 1,
  });
}
