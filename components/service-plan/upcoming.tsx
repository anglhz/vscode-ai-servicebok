import Link from "next/link";
import { getServiceIntervals } from "@/services/service-intervals";
import { getReminders } from "@/services/reminders";
import { DueSummary } from "./due-summary";
import { ReminderCard } from "@/components/reminders/reminder-card";

export async function NextService({ vehicleId }: { vehicleId: string }) {
  let result;
  try { result = await getServiceIntervals(vehicleId, 1, 1); }
  catch { return <p className="my-6 text-sm">Serviceplanen kunde inte hämtas just nu.</p>; }
  const interval = result.intervals[0];
  return <section className="my-6 space-y-3 rounded-lg border bg-card p-4">
    <h2 className="text-lg font-semibold">Nästa service</h2>
    {interval ? <><p className="font-medium">{interval.name}</p><DueSummary value={interval} /></> : <p className="text-sm text-muted-foreground">Lägg till egna intervall för att hålla koll på nästa service.</p>}
    <Link href={`/vehicles/${vehicleId}/service`} className="inline-flex min-h-12 items-center text-primary underline underline-offset-4">Visa serviceplan</Link>
  </section>;
}
export async function UpcomingReminders() {
  let result;
  try { result = await getReminders(1, 3); }
  catch { return <p className="mt-6 text-sm">Påminnelserna kunde inte hämtas just nu.</p>; }
  if (!result.reminders.length) return null;
  return <section className="mt-8 space-y-4"><h2 className="text-xl font-semibold">Att hålla koll på</h2>
    <div className="grid gap-4 lg:grid-cols-3">{result.reminders.map(reminder => <ReminderCard key={reminder.id} reminder={reminder} compact />)}</div>
    <Link href="/reminders" className="inline-flex min-h-12 items-center text-primary underline underline-offset-4">Visa alla påminnelser</Link>
  </section>;
}
