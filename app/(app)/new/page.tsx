import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Ny händelse" };

export default function NewEventPage() {
  return <>
    <PageHeader title="Ny händelse" description="Samla det som har gjorts på ditt fordon." />
    <EmptyState icon={<Plus className="size-6" />} title="Registrering kommer snart"
      description="Här kommer du att kunna registrera service, reparationer och andra händelser för ett valt fordon."
      action={<Button asChild variant="outline" className="min-h-12"><Link href="/vehicles">Till fordon</Link></Button>} />
  </>;
}
