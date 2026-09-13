"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveEvent } from "@/app/(app)/vehicles/[vehicleId]/events/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { eventCategories, eventCategoryLabels, type ServiceEventFields, type ServiceEventFormState } from "@/lib/validation/service-event";

export function EventForm({ vehicleId, eventId = null, initialValues }: { vehicleId: string; eventId?: string | null; initialValues: ServiceEventFields }) {
  const [values, setValues] = useState(initialValues);
  const [state, action, pending] = useActionState<ServiceEventFormState, FormData>(saveEvent.bind(null, vehicleId, eventId), {});
  const cancelUrl = `/vehicles/${vehicleId}${eventId ? `/events/${eventId}` : ""}`;
  const error = (name: keyof ServiceEventFields) => state.errors?.[name] && <p id={`${name}-error`} role="alert" className="text-sm text-destructive">{state.errors[name]?.[0]}</p>;
  const input = (name: keyof ServiceEventFields, label: string, options: { type?: string; required?: boolean; maxLength?: number; inputMode?: "numeric" | "decimal" } = {}) => <div className="space-y-2">
    <label htmlFor={name} className="text-sm font-medium">{label}</label>
    <Input id={name} name={name} {...options} value={values[name]} onChange={event => setValues({ ...values, [name]: event.target.value })}
      className="min-h-12 min-w-0 text-base" aria-invalid={Boolean(state.errors?.[name])} aria-describedby={state.errors?.[name] ? `${name}-error` : undefined} />
    {error(name)}
  </div>;
  return <form action={action} className="max-w-xl space-y-4">
    <div className="space-y-2">
      <label htmlFor="category" className="text-sm font-medium">Kategori</label>
      <select id="category" name="category" required value={values.category} onChange={event => setValues({ ...values, category: event.target.value as ServiceEventFields["category"] })}
        className="min-h-12 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-invalid={Boolean(state.errors?.category)} aria-describedby={state.errors?.category ? "category-error" : undefined}>
        {eventCategories.map(category => <option key={category} value={category}>{eventCategoryLabels[category]}</option>)}
      </select>{error("category")}
    </div>
    {input("event_date", "Datum", { type: "date", required: true })}
    {input("mileage", "Miltal i mil (valfritt)", { inputMode: "numeric", maxLength: 10 })}
    {input("title", "Rubrik", { required: true, maxLength: 150 })}
    {input("cost", "Kostnad i kronor (valfritt)", { inputMode: "decimal", maxLength: 11 })}
    <details className="rounded-lg border p-4" open={Boolean(state.errors?.description || state.errors?.provider_name || state.errors?.notes || initialValues.description || initialValues.provider_name || initialValues.notes)}>
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Mer information</summary>
      <div className="space-y-4 pt-3">
        {input("provider_name", "Verkstad eller utförare (valfritt)", { maxLength: 150 })}
        {(["description", "notes"] as const).map(name => <div key={name} className="space-y-2">
          <label htmlFor={name} className="text-sm font-medium">{name === "description" ? "Beskrivning (valfritt)" : "Anteckningar (valfritt)"}</label>
          <textarea id={name} name={name} rows={4} maxLength={5000} value={values[name]} onChange={event => setValues({ ...values, [name]: event.target.value })}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-invalid={Boolean(state.errors?.[name])} aria-describedby={state.errors?.[name] ? `${name}-error` : undefined} />{error(name)}
        </div>)}
      </div>
    </details>
    {state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
    <div className="flex flex-col gap-3 sm:flex-row-reverse">
      <Button disabled={pending} aria-busy={pending} type="submit" className="min-h-12 flex-1">{pending ? "Sparar…" : "Spara händelse"}</Button>
      <Button asChild variant="outline" className="min-h-12 flex-1"><Link href={cancelUrl}>Avbryt</Link></Button>
    </div>
  </form>;
}
