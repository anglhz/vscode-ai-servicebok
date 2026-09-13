import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { VehicleForm } from "@/components/vehicles/vehicle-form";

export const metadata: Metadata = { title: "Lägg till fordon" };
export default function NewVehiclePage() {
  return <>
    <PageHeader title="Lägg till fordon" description="Fyll i uppgifterna manuellt. Du kan lämna valfria fält tomma." />
    <VehicleForm />
  </>;
}
