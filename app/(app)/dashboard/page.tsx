import type { Metadata } from "next";
import Link from "next/link";
import { CarFront } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { VehicleCard } from "@/components/vehicles/vehicle-card";
import { getVehiclesForCurrentUser } from "@/services/vehicles";
import { Suspense } from "react";
import { UpcomingReminders } from "@/components/service-plan/upcoming";
import { measurePerformance } from "@/lib/observability/performance";

export const metadata: Metadata = { title: "Hem" };

export default async function DashboardPage() {
  const [vehicle] = await measurePerformance("dashboard.vehicles_query", () => getVehiclesForCurrentUser());
  return <>
    <PageHeader title="Hem" description="Ditt fordons historik, samlad på ett ställe." />
    {vehicle ? <div className="space-y-4"><VehicleCard vehicle={vehicle} /><Button variant="outline" asChild className="min-h-12"><Link href="/vehicles">Visa alla fordon</Link></Button></div> :
      <EmptyState icon={<CarFront className="size-6" />} title="Välkommen till Servicebok"
        description="Lägg till ditt första fordon för att komma igång."
        action={<Button asChild className="min-h-12"><Link href="/vehicles/new">Lägg till fordon</Link></Button>} />}
    {vehicle && <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Hämtar påminnelser…</p>}><UpcomingReminders /></Suspense>}
  </>;
}
