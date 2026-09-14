import { formatEventDate } from "@/lib/utils/date";
import { formatMileage } from "@/lib/utils/format";
import type { DueInfo } from "@/lib/validation/service-plan";

export const urgencyLabels = { overdue: "Försenad", due_soon: "Snart dags", ok: "Kommande", unknown: "Uppgifter saknas" };
export function DueSummary({ value }: { value: DueInfo }) {
  const days = value.remaining_days, miles = value.remaining_mileage;
  return <div className="space-y-2 text-sm">
    <p className={`font-semibold ${value.urgency === "overdue" ? "text-destructive" : "text-primary"}`}>{urgencyLabels[value.urgency]}</p>
    {value.due_mileage !== null && <p>Vid {formatMileage(value.due_mileage)}{miles !== null ? ` · ${miles < 0 ? `${formatMileage(-miles)} försenad` : miles === 0 ? "Dags nu" : `${formatMileage(miles)} kvar`}` : " · Nuvarande miltal saknas"}</p>}
    {value.due_date && <p>{value.due_mileage !== null ? "Eller senast " : "Senast "}{formatEventDate(value.due_date)}{days !== null ? ` · ${days < 0 ? `${-days} dagar försenad` : days === 0 ? "Idag" : `${days} dagar kvar`}` : ""}</p>}
    {value.due_date && value.due_mileage !== null && <p className="text-muted-foreground">Det som inträffar först gäller.</p>}
    {value.urgency === "unknown" && <p className="text-muted-foreground">Komplettera senaste service eller aktuellt miltal för att kunna bedöma nästa förfallo.</p>}
  </div>;
}
