"use client";
import { useState } from "react";
import { searchVehicle } from "@/app/(app)/vehicles/new/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VehicleForm } from "./vehicle-form";
import { normalizeRegistrationNumber } from "@/lib/utils/format";
import { lookupRegistrationSchema, type LookupResult } from "@/services/vehicle-data/types";

export function VehicleLookup() {
  const [registration, setRegistration] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [pending, setPending] = useState(false);
  const [manual, setManual] = useState(false);
  async function search(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = lookupRegistrationSchema.safeParse(registration);
    if (!parsed.success) { setResult({ message: "Ange ett registreringsnummer med bokstäver och siffror." }); return; }
    setRegistration(parsed.data); setPending(true); setResult(null);
    try { setResult(await searchVehicle(parsed.data)); }
    catch { setResult({ message: "Fordonsinformationen kunde inte hämtas just nu. Försök igen eller lägg till fordonet manuellt." }); }
    finally { setPending(false); }
  }
  if (manual) return <div className="max-w-xl space-y-4">
    <Button variant="outline" onClick={() => { setManual(false); setResult(null); }}>Tillbaka till sökning</Button>
    <VehicleForm registration={normalizeRegistrationNumber(registration)} />
  </div>;
  return <div className="max-w-xl space-y-6">
    <form onSubmit={search} className="space-y-3">
      <label htmlFor="lookup-registration" className="text-sm font-medium">Registreringsnummer</label>
      <Input id="lookup-registration" value={registration} maxLength={32} required autoCapitalize="characters" autoComplete="off"
        className="min-h-12 text-base" disabled={pending}
        onChange={event => { setRegistration(event.target.value); setResult(null); }} />
      <Button type="submit" className="min-h-12 w-full" disabled={pending} aria-busy={pending}>{pending ? "Söker fordon…" : "Sök fordon"}</Button>
    </form>
    <div aria-live="polite">{result?.message && <p role="alert" className="text-sm text-destructive">{result.message}</p>}</div>
    {result?.vehicle && <section className="space-y-4" aria-label="Fordonsförhandsvisning">
      <div className="space-y-2 rounded-lg border p-4 break-words">
        <h2 className="text-xl font-semibold">{result.vehicle.make} {result.vehicle.model}</h2>
        <p>{result.vehicle.registration_number} · {result.vehicle.model_year ?? "Årsmodell saknas"}</p>
        <p className="text-sm text-muted-foreground">{result.vehicle.fuel_type ?? "Bränsle saknas"}{result.vehicle.power_kw !== null ? ` · ${result.vehicle.power_kw} kW` : ""}</p>
        <p className="text-sm">Inget fordon har sparats ännu.</p>
      </div>
      <VehicleForm key={result.receipt} lookup={result} />
    </section>}
    <Button type="button" variant="outline" className="min-h-12 w-full" disabled={pending} onClick={() => setManual(true)}>Lägg till manuellt</Button>
  </div>;
}
