import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Påminnelser" };

export default function RemindersPage() {
  return <>
    <PageHeader title="Påminnelser" description="Håll koll på vad som behöver göras härnäst." />
    <EmptyState icon={<Bell className="size-6" />} title="Påminnelser kommer snart"
      description="Här samlas kommande service, besiktningar och andra viktiga datum för dina fordon." />
  </>;
}
