import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { IntervalForm } from "@/components/service-plan/interval-form";
import { IntervalCard } from "@/components/service-plan/interval-card";
import { getServiceInterval, getServiceIntervals } from "@/services/service-intervals";
import { getVehicleForCurrentUser } from "@/services/vehicles";
import { todayInSweden } from "@/lib/utils/date";
import type { IntervalFields } from "@/lib/validation/service-plan";

export const metadata: Metadata = { title: "Serviceplan" };
export default async function ServicePlanPage({ params, searchParams }: { params: Promise<{ vehicleId: string }>; searchParams: Promise<{ new?: string; edit?: string; complete?: string; page?: string }> }) {
  const { vehicleId } = await params; const query = await searchParams;
  const vehicle = await getVehicleForCurrentUser(vehicleId); const base = `/vehicles/${vehicleId}/service`;
  const intervalId = query.complete || query.edit;
  if (query.new === "1" || intervalId) {
    const interval = intervalId ? await getServiceInterval(vehicleId, intervalId) : null;
    const complete = Boolean(query.complete);
    const values: IntervalFields = { name: interval?.name ?? "", category: interval?.category ?? "service", distance_interval: interval?.distance_interval?.toString() ?? "", month_interval: interval?.month_interval?.toString() ?? "",
      last_completed_date: complete ? todayInSweden() : interval?.last_completed_date ?? "", last_completed_mileage: complete ? vehicle.current_mileage?.toString() ?? "" : interval?.last_completed_mileage?.toString() ?? "" };
    return <><PageHeader title={complete ? "Markera som utfört" : interval ? "Redigera intervall" : "Lägg till intervall"} description={complete ? interval?.name : `${vehicle.make} ${vehicle.model}`} />
      <IntervalForm vehicleId={vehicleId} intervalId={interval?.id} complete={complete} initialValues={values} /></>;
  }
  const requested = Number(query.page ?? 1), page = Number.isInteger(requested) && requested >= 1 && requested <= 10000 ? requested : 1;
  const { intervals, hasMore } = await getServiceIntervals(vehicleId, page);
  return <>
    <Link href={`/vehicles/${vehicleId}`} className="mb-4 inline-flex min-h-12 items-center text-primary underline underline-offset-4">Tillbaka till fordonet</Link>
    <PageHeader title="Serviceplan" description={`${vehicle.make} ${vehicle.model} · Dina egna serviceintervall`} />
    <Button asChild className="mb-6 min-h-12"><Link href={`${base}?new=1`}>Lägg till intervall</Link></Button>
    {intervals.length ? <div className="grid gap-4 lg:grid-cols-2">{intervals.map(interval => <IntervalCard key={interval.id} interval={interval} />)}</div> :
      <EmptyState title="Inga serviceintervall" description="Lägg till intervall från ditt fordons serviceanvisningar. Vi föreslår inga generella servicegränser." />}
    <nav aria-label="Sidor i serviceplanen" className="mt-4 flex justify-between gap-3">
      {page > 1 && <Link href={`${base}?page=${page - 1}`} className="inline-flex min-h-12 items-center text-primary underline">Föregående</Link>}
      {hasMore && <Link href={`${base}?page=${page + 1}`} className="inline-flex min-h-12 items-center text-primary underline">Nästa</Link>}
    </nav>
  </>;
}
