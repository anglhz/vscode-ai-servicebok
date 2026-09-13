import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EventForm } from "@/components/service-events/event-form";
import { DeleteEvent } from "@/components/service-events/delete-event";
import { MileageDisplay } from "@/components/mileage-display";
import { CurrencyDisplay } from "@/components/currency-display";
import { getServiceEventForVehicle } from "@/services/service-events";
import { eventCategoryLabels, sourceLabels } from "@/lib/validation/service-event";
import { formatEventDate } from "@/lib/utils/date";
import { oreToKronorInput } from "@/lib/utils/money";

export const metadata: Metadata = { title: "Servicehändelse" };
export default async function ServiceEventPage({ params, searchParams }: {
  params: Promise<{ vehicleId: string; eventId: string }>; searchParams: Promise<{ edit?: string }>;
}) {
  const { vehicleId, eventId } = await params;
  const event = await getServiceEventForVehicle(vehicleId, eventId);
  const editing = (await searchParams).edit === "1";
  return <>
    <Link href={`/vehicles/${vehicleId}`} className="mb-4 inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">Tillbaka till fordonet</Link>
    <PageHeader title={editing ? "Redigera händelse" : event.title} description={eventCategoryLabels[event.category]} />
    {editing ? <EventForm key={event.id} vehicleId={vehicleId} eventId={eventId} initialValues={{ category: event.category, title: event.title, event_date: event.event_date, mileage: event.mileage?.toString() ?? "", cost: oreToKronorInput(event.cost_amount), provider_name: event.provider_name ?? "", description: event.description ?? "", notes: event.notes ?? "" }} /> : <div className="max-w-xl space-y-6">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-muted-foreground">Datum</dt><dd>{formatEventDate(event.event_date)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Miltal</dt><dd><MileageDisplay value={event.mileage} /></dd></div>
        <div><dt className="text-sm text-muted-foreground">Kostnad</dt><dd><CurrencyDisplay amountInOre={event.cost_amount} /></dd></div>
        <div className="min-w-0"><dt className="text-sm text-muted-foreground">Utförare</dt><dd className="break-words">{event.provider_name ?? "Ej angivet"}</dd></div>
      </dl>
      {event.description && <section><h2 className="mb-2 font-semibold">Beskrivning</h2><p className="whitespace-pre-wrap break-words">{event.description}</p></section>}
      {event.notes && <section><h2 className="mb-2 font-semibold">Anteckningar</h2><p className="whitespace-pre-wrap break-words">{event.notes}</p></section>}
      <p className="text-sm text-muted-foreground">{sourceLabels[event.source_type]}</p>
      <div className="flex flex-wrap items-start gap-3">
        <Button asChild className="min-h-12"><Link href={`/vehicles/${vehicleId}/events/${eventId}?edit=1`}>Redigera</Link></Button>
        <DeleteEvent vehicleId={vehicleId} eventId={eventId} />
      </div>
    </div>}
  </>;
}
