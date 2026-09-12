import type { Metadata } from "next";
import Link from "next/link";
import { CarFront } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Hem" };

export default function DashboardPage() {
  return <>
    <PageHeader title="Hem" description="Ditt fordons historik, samlad på ett ställe." />
    <EmptyState icon={<CarFront className="size-6" />} title="Välkommen till Servicebok"
      description="Här får du snart en överblick över dina fordon, senaste service och kommande påminnelser."
      action={<Button asChild className="min-h-12"><Link href="/vehicles">Visa fordon</Link></Button>} />
  </>;
}
