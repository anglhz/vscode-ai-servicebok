import { getStripe, stripeEnvironment } from "@/lib/stripe/server";
import { processBillingEvent } from "@/services/subscriptions/webhook";
import { logBilling } from "@/lib/observability/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  let stripe, secret;
  try { stripe = getStripe(); secret = stripeEnvironment("STRIPE_WEBHOOK_SECRET"); }
  catch { logBilling("configuration_error"); return new Response("Webhook unavailable", { status: 503 }); }
  let event;
  try { event = stripe.webhooks.constructEvent(await request.text(), request.headers.get("stripe-signature") ?? "", secret); }
  catch { logBilling("invalid_signature"); return new Response("Invalid signature", { status: 400 }); }
  try { await processBillingEvent(event); logBilling("processed", event); return Response.json({ received: true }); }
  catch { logBilling("processing_error", event); return new Response("Webhook processing failed", { status: 500 }); }
}
