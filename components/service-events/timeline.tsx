import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ServiceEventCard } from "@/components/service-events/event-card";
import type { ServiceEvent } from "@/lib/validation/service-event";

export function ServiceTimeline({ vehicleId, events, page, hasMore }: { vehicleId: string; events: ServiceEvent[]; page: number; hasMore: boolean }) {
  const newAction = <Button asChild className="min-h-12"><Link href={`/vehicles/${vehicleId}/events/new`}>Ny händelse</Link></Button>;
  return <section className="space-y-4" aria-labelledby="history-title">
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 id="history-title" className="text-xl font-semibold">Servicehistorik</h2>{events.length > 0 && newAction}</div>
    {events.length ? <ol className="space-y-4">{events.map(event => <li key={event.id}><ServiceEventCard event={event} /></li>)}</ol> :
      <EmptyState title={page === 1 ? "Ingen servicehistorik ännu" : "Inga fler händelser"} description="Lägg till din första händelse för att börja bygga fordonets historik." action={newAction} />}
    <nav aria-label="Historiksidor" className="flex flex-wrap gap-3">
      {page > 1 && <Button asChild variant="outline" className="min-h-12"><Link href={`/vehicles/${vehicleId}?page=${page - 1}`}>Nyare händelser</Link></Button>}
      {hasMore && <Button asChild variant="outline" className="min-h-12"><Link href={`/vehicles/${vehicleId}?page=${page + 1}`}>Äldre händelser</Link></Button>}
    </nav>
  </section>;
}
