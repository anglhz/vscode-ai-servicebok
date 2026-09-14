"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { saveReminder } from "@/app/(app)/reminders/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Vehicle } from "@/lib/validation/vehicle";
import type { PlanFormState } from "@/lib/validation/service-plan";

export function ReminderForm({ vehicles }: { vehicles: Vehicle[] }) {
  const [values, setValues] = useState({ vehicle_id: vehicles[0]?.id ?? "", title: "", due_date: "", due_mileage: "" });
  const [state, action, pending] = useActionState<PlanFormState, FormData>(saveReminder, {});
  return <form action={action} className="max-w-xl space-y-4">
    <div className="space-y-2"><label htmlFor="vehicle_id" className="text-sm font-medium">Fordon</label>
      <select id="vehicle_id" name="vehicle_id" value={values.vehicle_id} onChange={event => setValues({ ...values, vehicle_id: event.target.value })} className="min-h-12 w-full rounded-md border border-input bg-background px-3 text-base">
        {vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model} {vehicle.registration_number}</option>)}
      </select>{state.errors?.vehicle_id && <p role="alert" className="text-sm text-destructive">{state.errors.vehicle_id[0]}</p>}</div>
    {([['title','Titel'],['due_date','Datum (valfritt)'],['due_mileage','Miltal i mil (valfritt)']] as const).map(([name,label]) => <div className="space-y-2" key={name}>
      <label htmlFor={name} className="text-sm font-medium">{label}</label>
      <Input id={name} name={name} type={name === "due_date" ? "date" : "text"} required={name === "title"} maxLength={name === "title" ? 150 : 10} inputMode={name === "due_mileage" ? "numeric" : undefined}
        value={values[name]} onChange={event => setValues({ ...values, [name]: event.target.value })} className="min-h-12 min-w-0 text-base"
        aria-invalid={Boolean(state.errors?.[name])} aria-describedby={state.errors?.[name] ? `${name}-error` : undefined} />
      {state.errors?.[name] && <p id={`${name}-error`} role="alert" className="text-sm text-destructive">{state.errors[name]?.[0]}</p>}
    </div>)}
    <p className="text-sm text-muted-foreground">Ange datum, miltal eller båda.</p>
    {state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
    <div className="flex flex-col gap-3 sm:flex-row-reverse"><Button type="submit" className="min-h-12 flex-1" disabled={pending} aria-busy={pending}>{pending ? "Sparar…" : "Spara påminnelse"}</Button>
      <Button asChild variant="outline" className="min-h-12 flex-1"><Link href="/reminders">Avbryt</Link></Button></div>
  </form>;
}
