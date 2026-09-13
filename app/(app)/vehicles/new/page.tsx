import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { VehicleLookup } from "@/components/vehicles/vehicle-lookup";

export const metadata: Metadata = { title: "Lägg till fordon" };
export default function NewVehiclePage() {
  return <>
    <PageHeader title="Lägg till fordon" description="Sök med registreringsnummer eller lägg till fordonet manuellt." />
    <VehicleLookup />
  </>;
}
