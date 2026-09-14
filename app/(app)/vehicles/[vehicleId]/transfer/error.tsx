"use client";
import { Button } from "@/components/ui/button";
export default function TransferError({ reset }: { reset: () => void }) {
  return <section className="space-y-4"><h1 className="text-xl font-semibold">Överföringen kunde inte hämtas</h1><p>Försök igen om en stund.</p><Button onClick={reset} className="min-h-12">Försök igen</Button></section>;
}
