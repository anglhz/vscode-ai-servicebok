"use client";
import { Button } from "@/components/ui/button";
export default function ServicePlanError({ reset }: { reset: () => void }) {
  return <div className="space-y-4"><h1 className="text-xl font-semibold">Serviceplanen kunde inte hämtas.</h1><Button className="min-h-12" onClick={reset}>Försök igen</Button></div>;
}
