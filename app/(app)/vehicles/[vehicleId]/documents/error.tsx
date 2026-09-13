"use client";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
export default function DocumentsError({ reset }: { reset: () => void }) {
  return <EmptyState title="Dokumenten kunde inte hämtas" description="Försök igen om en stund."
    action={<Button onClick={reset} className="min-h-12">Försök igen</Button>} />;
}
