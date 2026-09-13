import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";
import { getVehiclesForCurrentUser } from "@/services/vehicles";

export const metadata: Metadata = { title: "Ny händelse" };

export default async function NewEventPage() {
  const vehicles = await getVehiclesForCurrentUser();
  if (vehicles.length === 1) redirect(`/vehicles/${vehicles[0].id}/events/new`);
  return <>
    <PageHeader title="Ny händelse" description="Samla det som har gjorts på ditt fordon." />
    {vehicles.length ? <div className="max-w-xl space-y-3"><h2 className="font-semibold">Välj fordon</h2>{vehicles.map(vehicle =>
      <Link key={vehicle.id} href={`/vehicles/${vehicle.id}/events/new`} className="block min-h-12 break-words rounded-lg border bg-card p-4 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">{vehicle.make} {vehicle.model}{vehicle.registration_number ? ` · ${vehicle.registration_number}` : ""}</Link>)}</div> :
      <EmptyState icon={<Plus className="size-6" />} title="Lägg till ett fordon först"
        description="Välj sedan Ny för att registrera din första händelse."
        action={<Button asChild className="min-h-12"><Link href="/vehicles/new">Lägg till fordon</Link></Button>} />}
  </>;
}
