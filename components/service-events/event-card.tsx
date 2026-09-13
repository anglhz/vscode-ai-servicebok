import Link from "next/link";
import { MileageDisplay } from "@/components/mileage-display";
import { CurrencyDisplay } from "@/components/currency-display";
import { formatEventDate } from "@/lib/utils/date";
import { eventCategoryLabels, type ServiceEvent } from "@/lib/validation/service-event";

export function ServiceEventCard({ event }: { event: ServiceEvent }) {
  return <Link href={`/vehicles/${event.vehicle_id}/events/${event.id}`} className="block min-w-0 space-y-2 rounded-lg border bg-card p-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <time dateTime={event.event_date} className="text-sm text-muted-foreground">{formatEventDate(event.event_date)}</time>
    <p className="text-xs font-medium text-muted-foreground">{eventCategoryLabels[event.category]}</p>
    <h3 className="break-words font-semibold">{event.title}</h3>
    <div className="flex flex-wrap gap-3 text-sm">
      {event.mileage !== null && <MileageDisplay value={event.mileage} />}
      {event.cost_amount !== null && <CurrencyDisplay amountInOre={event.cost_amount} />}
    </div>
    {event.provider_name && <p className="break-words text-sm text-muted-foreground">{event.provider_name}</p>}
  </Link>;
}
