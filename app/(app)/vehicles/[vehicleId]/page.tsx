import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { RegistrationNumber } from "@/components/vehicles/registration-number";
import { MileageDisplay } from "@/components/mileage-display";
import { vehicleTypeLabels } from "@/lib/validation/vehicle";
import { getVehicleForCurrentUser } from "@/services/vehicles";

export const metadata: Metadata = { title: "Fordon" };
export default async function VehiclePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const vehicle = await getVehicleForCurrentUser((await params).vehicleId);
  return <>
    <Link href="/vehicles" className="mb-4 inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">Tillbaka till mina fordon</Link>
    <PageHeader title={`${vehicle.make} ${vehicle.model}`} />
    <dl className="mb-8 grid gap-4 sm:grid-cols-2">
      <div><dt className="mb-2 text-sm text-muted-foreground">Registreringsnummer</dt><dd><RegistrationNumber value={vehicle.registration_number} /></dd></div>
      <div><dt className="mb-2 text-sm text-muted-foreground">Årsmodell</dt><dd>{vehicle.model_year ?? "Ej angivet"}</dd></div>
      <div><dt className="mb-2 text-sm text-muted-foreground">Nuvarande miltal</dt><dd><MileageDisplay value={vehicle.current_mileage} /></dd></div>
      <div><dt className="mb-2 text-sm text-muted-foreground">Fordonstyp</dt><dd>{vehicleTypeLabels[vehicle.vehicle_type]}</dd></div>
      {vehicle.vin && <div><dt className="mb-2 text-sm text-muted-foreground">VIN / chassinummer</dt><dd className="break-all">{vehicle.vin}</dd></div>}
    </dl>
    <EmptyState title="Ingen servicehistorik ännu" description="Här kommer du senare att kunna samla fordonets service och reparationer." />
  </>;
}
