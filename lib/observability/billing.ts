import "server-only";

type Outcome = "configuration_error" | "invalid_signature" | "processed" | "processing_error";
export function logBilling(outcome: Outcome, event?: { id: string; type: string }) {
  const record: Record<string, string> = { category: "stripe_webhook", outcome };
  if (event && /^evt_[A-Za-z0-9]{1,100}$/.test(event.id)) record.event_id = event.id;
  const types = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"];
  if (event && types.includes(event.type)) record.event_type = event.type;
  // Never pass the request, event object, exception or SDK response to the logger.
  if (outcome === "processed") console.info(JSON.stringify(record));
  else console.warn(JSON.stringify(record));
}
