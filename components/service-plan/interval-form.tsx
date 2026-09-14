"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { saveInterval } from "@/app/(app)/vehicles/[vehicleId]/service/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { eventCategories, eventCategoryLabels } from "@/lib/validation/service-event";
import type { IntervalFields, PlanFormState } from "@/lib/validation/service-plan";

export function IntervalForm({ vehicleId, intervalId = null, complete = false, initialValues }: { vehicleId: string; intervalId?: string | null; complete?: boolean; initialValues: IntervalFields }) {
  const [values, setValues] = useState(initialValues);
  const [state, action, pending] = useActionState<PlanFormState, FormData>(saveInterval.bind(null, vehicleId, intervalId, complete), {});
  function field(name: keyof IntervalFields, label: string, type = "text", required = false) {
    return <div className="space-y-2"><label htmlFor={name} className="text-sm font-medium">{label}</label>
      <Input id={name} name={name} type={type} required={required} value={values[name]} onChange={event => setValues({ ...values, [name]: event.target.value })}
        inputMode={name.includes("mileage") || name.includes("interval") ? "numeric" : undefined} maxLength={name === "name" ? 150 : 10}
        className="min-h-12 min-w-0 text-base" aria-invalid={Boolean(state.errors?.[name])} aria-describedby={state.errors?.[name] ? `${name}-error` : undefined} />
      {state.errors?.[name] && <p id={`${name}-error`} role="alert" className="text-sm text-destructive">{state.errors[name]?.[0]}</p>}
    </div>;
  }
  return <form action={action} className="max-w-xl space-y-4">
    {!complete && <>
      {field("name", "Namn", "text", true)}
      <div className="space-y-2"><label htmlFor="category" className="text-sm font-medium">Kategori</label>
        <select id="category" name="category" value={values.category} onChange={event => setValues({ ...values, category: event.target.value as IntervalFields["category"] })}
          aria-invalid={Boolean(state.errors?.category)} aria-describedby={state.errors?.category ? "category-error" : undefined}
          className="min-h-12 w-full rounded-md border border-input bg-background px-3 text-base">
          {eventCategories.map(category => <option key={category} value={category}>{eventCategoryLabels[category]}</option>)}
        </select>{state.errors?.category && <p id="category-error" role="alert" className="text-sm text-destructive">{state.errors.category[0]}</p>}</div>
      {field("distance_interval", "Var X mil (valfritt)")}{field("month_interval", "Var X månader (valfritt)")}
      <p className="text-sm text-muted-foreground">Ange mil, månader eller båda. Utgå från ditt fordons serviceanvisningar.</p>
    </>}
    {field("last_completed_date", complete ? "Utfört datum (valfritt)" : "Senast utfört datum (valfritt)", "date")}
    {field("last_completed_mileage", complete ? "Miltal vid utförandet i mil (valfritt)" : "Senast utfört vid miltal i mil (valfritt)")}
    {complete && <p className="text-sm text-muted-foreground">Detta uppdaterar serviceplanen. Fordonets registrerade mätarställning och servicehistorik ändras inte.</p>}
    {state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
    <div className="flex flex-col gap-3 sm:flex-row-reverse">
      <Button type="submit" disabled={pending} aria-busy={pending} className="min-h-12 flex-1">{pending ? "Sparar…" : complete ? "Bekräfta utfört" : "Spara intervall"}</Button>
      <Button asChild variant="outline" className="min-h-12 flex-1"><Link href={`/vehicles/${vehicleId}/service`}>Avbryt</Link></Button>
    </div>
  </form>;
}
