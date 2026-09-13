import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
export default function EventNotFound() {
  return <EmptyState title="Händelsen kunde inte hittas" description="Gå tillbaka till dina fordon."
    action={<Button asChild className="min-h-12"><Link href="/vehicles">Mina fordon</Link></Button>} />;
}
