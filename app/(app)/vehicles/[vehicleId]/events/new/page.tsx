import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EventForm } from "@/components/service-events/event-form";
import { getVehicleForCurrentUser } from "@/services/vehicles";
import { todayInSweden } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Ny händelse" };
export default async function NewServiceEventPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const vehicle = await getVehicleForCurrentUser((await params).vehicleId);
  return <><PageHeader title="Ny händelse" description={`${vehicle.make} ${vehicle.model}`} />
    <EventForm vehicleId={vehicle.id} initialValues={{ category: "service", title: "", event_date: todayInSweden(), mileage: vehicle.current_mileage?.toString() ?? "", cost: "", description: "", provider_name: "", notes: "" }} />
  </>;
}
