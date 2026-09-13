import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
export default function VehicleNotFound() {
  return <EmptyState title="Fordonet kunde inte hittas" description="Gå tillbaka till dina fordon."
    action={<Button asChild className="min-h-12"><Link href="/vehicles">Mina fordon</Link></Button>} />;
}
