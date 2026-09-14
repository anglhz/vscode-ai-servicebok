import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ReminderCard } from "@/components/reminders/reminder-card";
import { ReminderForm } from "@/components/reminders/reminder-form";
import { getReminders } from "@/services/reminders";
import { getVehiclesForCurrentUser } from "@/services/vehicles";

export const metadata: Metadata = { title: "Påminnelser" };

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ new?: string; page?: string }> }) {
  const query = await searchParams;
  if (query.new === "1") {
    const vehicles = await getVehiclesForCurrentUser();
    return <><PageHeader title="Ny påminnelse" description="Välj datum, miltal eller båda." />{vehicles.length ? <ReminderForm vehicles={vehicles} /> :
      <EmptyState title="Lägg till ett fordon först" description="Påminnelser hör till ett fordon." action={<Button asChild className="min-h-12"><Link href="/vehicles/new">Lägg till fordon</Link></Button>} />}</>;
  }
  const requested = Number(query.page ?? 1), page = Number.isInteger(requested) && requested >= 1 && requested <= 10000 ? requested : 1;
  const { reminders, hasMore } = await getReminders(page);
  return <>
    <PageHeader title="Påminnelser" description="Håll koll på vad som behöver göras härnäst." />
    <Button asChild className="mb-6 min-h-12"><Link href="/reminders?new=1">Ny påminnelse</Link></Button>
    {reminders.length ? <div className="grid gap-4 lg:grid-cols-2">{reminders.map(reminder => <ReminderCard key={reminder.id} reminder={reminder} />)}</div> :
      <EmptyState icon={<Bell className="size-6" />} title="Inga aktiva påminnelser" description="Lägg till en egen påminnelse eller ett intervall i fordonets serviceplan." />}
    <nav aria-label="Påminnelsesidor" className="mt-4 flex justify-between gap-3">
      {page > 1 && <Link href={`/reminders?page=${page - 1}`} className="inline-flex min-h-12 items-center text-primary underline">Föregående</Link>}
      {hasMore && <Link href={`/reminders?page=${page + 1}`} className="inline-flex min-h-12 items-center text-primary underline">Nästa</Link>}
    </nav>
  </>;
}
