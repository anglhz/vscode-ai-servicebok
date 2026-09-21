import { getBillingOverview } from "@/services/subscriptions";
import { BillingButton } from "./billing-button";

const labels: Record<string, string> = { inactive: "Inget aktivt abonnemang", active: "Aktivt", trialing: "Provperiod", past_due: "Betalning försenad", canceled: "Avslutat", unpaid: "Obetalt", incomplete: "Betalning väntar", incomplete_expired: "Betalning utgången", paused: "Pausat" };
export async function BillingSummary({ checkout }: { checkout?: string }) {
  const billing = await getBillingOverview().catch(() => null);
  if (!billing) return <section className="mt-6 max-w-lg rounded-xl border bg-card p-6"><h2 className="font-semibold">Abonnemang</h2><p role="status" className="mt-2 text-sm">Abonnemanget kunde inte hämtas. Försök igen senare.</p></section>;
  return <section className="mt-6 max-w-lg space-y-4 rounded-xl border bg-card p-6">
    <h2 className="text-lg font-semibold">Plan: {billing.plan === "premium" ? "Premium" : "Free"}</h2>
    <p className="text-sm">{labels[billing.status] ?? "Status ej tillgänglig"}</p>
    {checkout === "success" && billing.plan === "free" && <p role="status" className="text-sm">Betalningen behandlas. Premium aktiveras när betalningen har bekräftats.</p>}
    {checkout === "cancelled" && <p role="status" className="text-sm">Betalningen avbröts. Ditt abonnemang har inte ändrats här.</p>}
    {billing.current_period_end && <p className="text-sm">{billing.cancel_at_period_end ? "Uppsägning planerad till" : billing.plan === "premium" ? "Nuvarande period gäller till" : "Senaste periodens slut"} {new Intl.DateTimeFormat("sv-SE", { dateStyle: "long", timeZone: "Europe/Stockholm" }).format(new Date(billing.current_period_end))}.</p>}
    <p className="text-sm text-muted-foreground">{billing.vehicle_count} aktiva fordon · {billing.limits.vehicles === null ? "Obegränsat antal" : `Högst ${billing.limits.vehicles}`} i din plan.<br />Dokument: {(billing.document_bytes / 1048576).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} av {billing.limits.document_bytes / 1048576} MiB.</p>
    <p className="text-sm">Premium innehåller PDF-export, fler fordon och mer dokumentutrymme. Pris och betalningsvillkor visas i Stripe innan du bekräftar.</p>
    {billing.plan === "free" && <BillingButton />}
    {billing.has_customer && <BillingButton manage />}
  </section>;
}
