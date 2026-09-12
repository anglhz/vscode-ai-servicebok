import type { Metadata } from "next";
import { CarFront } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Fordon" };

export default function VehiclesPage() {
  return <>
    <PageHeader title="Fordon" description="En plats för dina fordons servicehistorik." />
    <EmptyState icon={<CarFront className="size-6" />} title="Dina fordon samlas här"
      description="Snart kan du lägga till ett fordon och börja samla service, reparationer och kvitton." />
  </>;
}
