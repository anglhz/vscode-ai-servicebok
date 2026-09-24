import type { Metadata } from "next";
import { CarFront } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { VehicleCard } from "@/components/vehicles/vehicle-card";
import { getVehiclesForCurrentUser } from "@/services/vehicles";

export const metadata: Metadata = { title: "Fordon" };

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const vehicles = await getVehiclesForCurrentUser();
  const addAction = <Button asChild className="min-h-12"><Link href="/vehicles/new">Lägg till fordon</Link></Button>;
  return <>
    <PageHeader title="Mina fordon" description="Dina fordon, samlade på ett ställe." action={vehicles.length ? addAction : undefined} />
    {(await searchParams).deleted === "1" && <p role="status" className="mb-6 rounded-md border p-4 text-sm">Det felregistrerade fordonet har tagits bort.</p>}
    {vehicles.length ? <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{vehicles.map(vehicle => <VehicleCard key={vehicle.id} vehicle={vehicle} />)}</div> :
      <EmptyState icon={<CarFront className="size-6" />} title="Inga fordon ännu"
        description="Lägg till ditt första fordon för att komma igång med din servicebok." action={addAction} />}
  </>;
}
