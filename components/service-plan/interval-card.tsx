import type { ServiceInterval } from "@/lib/validation/service-plan";
import { formatEventDate } from "@/lib/utils/date";
import { formatMileage } from "@/lib/utils/format";
import { DueSummary } from "./due-summary";
import { IntervalActions } from "./interval-actions";

export function IntervalCard({ interval }: { interval: ServiceInterval }) {
  return <article className="space-y-4 rounded-lg border bg-card p-4 break-words">
    <div><h2 className="text-lg font-semibold">{interval.name}</h2><p className="text-sm text-muted-foreground">
      {interval.distance_interval !== null ? `Var ${formatMileage(interval.distance_interval)}` : ""}{interval.distance_interval !== null && interval.month_interval !== null ? " eller " : ""}{interval.month_interval !== null ? `var ${interval.month_interval} månader` : ""}</p></div>
    <DueSummary value={interval} />
    <p className="text-sm text-muted-foreground">Senast utfört: {interval.last_completed_date ? formatEventDate(interval.last_completed_date) : "Datum saknas"} · {interval.last_completed_mileage !== null ? formatMileage(interval.last_completed_mileage) : "Miltal saknas"}</p>
    <IntervalActions vehicleId={interval.vehicle_id} intervalId={interval.id} />
  </article>;
}
