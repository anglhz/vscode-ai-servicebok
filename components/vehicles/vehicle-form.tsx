"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveVehicle } from "@/app/(app)/vehicles/new/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { vehicleTypes, vehicleTypeLabels, type VehicleField, type VehicleFormState } from "@/lib/validation/vehicle";

const fields: { name: Exclude<VehicleField, "vehicle_type">; label: string; required?: boolean; maxLength: number; numeric?: boolean }[] = [
  { name: "registration_number", label: "Registreringsnummer (valfritt)", maxLength: 32 },
  { name: "make", label: "Märke", required: true, maxLength: 100 },
  { name: "model", label: "Modell", required: true, maxLength: 100 },
  { name: "model_year", label: "Årsmodell (valfritt)", maxLength: 4, numeric: true },
  { name: "current_mileage", label: "Nuvarande miltal i mil (valfritt)", maxLength: 10, numeric: true },
  { name: "vin", label: "VIN / chassinummer (valfritt)", maxLength: 64 },
  { name: "fuel_type", label: "Bränsle (valfritt)", maxLength: 50 },
];

export function VehicleForm() {
  const [state, action, pending] = useActionState<VehicleFormState, FormData>(saveVehicle, {});
  const [values, setValues] = useState<Record<VehicleField, string>>({ vehicle_type: "car", registration_number: "", make: "", model: "", model_year: "", current_mileage: "", vin: "", fuel_type: "" });
  return <form action={action} className="max-w-xl space-y-4">
    <div className="space-y-2">
      <label htmlFor="vehicle_type" className="text-sm font-medium">Fordonstyp</label>
      <select id="vehicle_type" name="vehicle_type" required value={values.vehicle_type}
        onChange={event => setValues({ ...values, vehicle_type: event.target.value })}
        aria-invalid={Boolean(state.errors?.vehicle_type)} aria-describedby={state.errors?.vehicle_type ? "vehicle_type-error" : undefined}
        className="flex min-h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {vehicleTypes.map(type => <option value={type} key={type}>{vehicleTypeLabels[type]}</option>)}
      </select>
      {state.errors?.vehicle_type && <p id="vehicle_type-error" role="alert" className="text-sm text-destructive">{state.errors.vehicle_type[0]}</p>}
    </div>
    {fields.map(({ name, label, required, maxLength, numeric }) => <div className="space-y-2" key={name}>
      <label htmlFor={name} className="text-sm font-medium">{label}</label>
      <Input id={name} name={name} required={required} maxLength={maxLength} inputMode={numeric ? "numeric" : "text"}
        value={values[name]} onChange={event => setValues({ ...values, [name]: event.target.value })}
        className="min-h-12 text-base" aria-invalid={Boolean(state.errors?.[name])}
        aria-describedby={state.errors?.[name] ? `${name}-error` : undefined} />
      {state.errors?.[name] && <p id={`${name}-error`} role="alert" className="text-sm text-destructive">{state.errors[name]?.[0]}</p>}
    </div>)}
    {state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
    <div className="flex flex-col gap-3 pt-2 sm:flex-row-reverse">
      <Button type="submit" disabled={pending} aria-busy={pending} className="min-h-12 flex-1">{pending ? "Sparar…" : "Spara fordon"}</Button>
      <Button variant="outline" asChild className="min-h-12 flex-1"><Link href="/vehicles">Avbryt</Link></Button>
    </div>
  </form>;
}
