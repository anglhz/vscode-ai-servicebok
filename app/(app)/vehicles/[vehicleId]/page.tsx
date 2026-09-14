import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ServiceTimeline } from "@/components/service-events/timeline";
import { getServiceEventsForVehicle } from "@/services/service-events";
import { RegistrationNumber } from "@/components/vehicles/registration-number";
import { MileageDisplay } from "@/components/mileage-display";
import { vehicleTypeLabels } from "@/lib/validation/vehicle";
import { getVehicleForCurrentUser } from "@/services/vehicles";
import { Suspense } from "react";
import { NextService } from "@/components/service-plan/upcoming";

export const metadata: Metadata = { title: "Fordon" };
export default async function VehiclePage({ params, searchParams }: { params: Promise<{ vehicleId: string }>; searchParams: Promise<{ page?: string }> }) {
  const { vehicleId } = await params;
  const requestedPage = Number((await searchParams).page ?? 1);
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 10000 ? requestedPage : 1;
  const [vehicle, history] = await Promise.all([getVehicleForCurrentUser(vehicleId), getServiceEventsForVehicle(vehicleId, page)]);
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
    <Link href={`/vehicles/${vehicle.id}/documents`} className="mb-6 inline-flex min-h-12 items-center text-primary underline underline-offset-4">Visa dokument</Link>
    <Suspense fallback={<p className="my-6 text-sm text-muted-foreground">Hämtar serviceplan…</p>}><NextService vehicleId={vehicle.id} /></Suspense>
    <ServiceTimeline vehicleId={vehicle.id} events={history.events} hasMore={history.hasMore} page={page} />
  </>;
}
