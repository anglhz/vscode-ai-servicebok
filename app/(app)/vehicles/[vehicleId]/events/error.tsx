"use client";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
export default function EventError({ reset }: { reset: () => void }) {
  return <EmptyState title="Händelsen kunde inte hämtas" description="Försök igen om en stund."
    action={<Button onClick={reset} className="min-h-12">Försök igen</Button>} />;
}
