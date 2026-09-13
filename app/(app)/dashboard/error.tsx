"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
export default function DashboardError({ reset }: { reset: () => void }) {
  return <EmptyState title="Översikten kunde inte hämtas" description="Försök igen om en stund."
    action={<Button onClick={reset} className="min-h-12">Försök igen</Button>} />;
}
