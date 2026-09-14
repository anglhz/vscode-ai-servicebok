import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DueSummary } from "@/components/service-plan/due-summary";
import { ReminderActions } from "./reminder-actions";
import type { Reminder } from "@/lib/validation/service-plan";

export function ReminderCard({ reminder, compact = false }: { reminder: Reminder; compact?: boolean }) {
  return <article className="space-y-3 rounded-lg border bg-card p-4 break-words">
    <h2 className="text-lg font-semibold">{reminder.title}</h2>
    <Link href={`/vehicles/${reminder.vehicle_id}`} className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">{reminder.make} {reminder.model} {reminder.registration_number}</Link>
    <DueSummary value={reminder} />
    {!compact && <div className="space-y-2">
      {reminder.service_interval_id && <Button asChild className="min-h-12"><Link href={`/vehicles/${reminder.vehicle_id}/service?complete=${reminder.service_interval_id}`}>Markera som utfört</Link></Button>}
      <ReminderActions vehicleId={reminder.vehicle_id} reminderId={reminder.id} linked={Boolean(reminder.service_interval_id)} />
    </div>}
  </article>;
}
