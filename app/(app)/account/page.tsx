import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Konto" };

export default function AccountPage() {
  return <>
    <PageHeader title="Konto" description="Dina uppgifter och inställningar." />
    <EmptyState icon={<UserRound className="size-6" />} title="Ditt konto får en plats här"
      description="Inloggning och kontoinställningar kommer i ett kommande steg." />
  </>;
}
