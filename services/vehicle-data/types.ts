import { z } from "zod";
import { normalizeRegistrationNumber } from "@/lib/utils/format";
import { normalizeVin, vehicleTypes } from "@/lib/validation/vehicle";

export const lookupRegistrationSchema = z.string().max(256).transform(normalizeRegistrationNumber)
  .pipe(z.string().regex(/^[A-Z0-9]{2,32}$/, "Ange ett registreringsnummer med bokstäver och siffror."));
const text = (max: number) => z.string().trim().min(1).max(max).regex(/^[^\p{Cc}\p{Cf}]*$/u);
const year = z.number().int().min(1886).max(2100).nullable();
export const normalizedVehicleSchema = z.object({
  registration_number: lookupRegistrationSchema,
  vin: text(64).transform(normalizeVin).nullable(),
  make: text(100), model: text(100), model_year: year, vehicle_year: year,
  fuel_type: text(50).nullable(), power_kw: z.number().int().min(0).max(2147483647).nullable(),
  vehicle_type: z.enum(vehicleTypes), first_registration_date: z.iso.date().nullable(),
  color: text(100).nullable(), external_provider: text(50), external_provider_id: text(200).nullable(),
});
export type NormalizedVehicle = z.infer<typeof normalizedVehicleSchema>;
export type LookupErrorCode = "unavailable" | "not_found" | "timeout" | "rate_limit" | "invalid_response" | "provider_error" | "network";
export class VehicleLookupError extends Error {
  constructor(public readonly code: LookupErrorCode) { super(code); }
}
export const lookupMessages: Record<LookupErrorCode, string> = {
  unavailable: "Automatisk sökning är inte tillgänglig. Lägg till fordonet manuellt.",
  not_found: "Fordonet kunde inte hittas automatiskt. Lägg till fordonet manuellt.",
  timeout: "Sökningen tog för lång tid. Försök igen eller lägg till fordonet manuellt.",
  rate_limit: "För många sökningar. Vänta en minut eller lägg till fordonet manuellt.",
  invalid_response: "Fordonsinformationen kunde inte hämtas just nu. Försök igen eller lägg till fordonet manuellt.",
  provider_error: "Fordonsinformationen kunde inte hämtas just nu. Försök igen eller lägg till fordonet manuellt.",
  network: "Fordonsinformationen kunde inte hämtas just nu. Försök igen eller lägg till fordonet manuellt.",
};
export type LookupResult = { vehicle: NormalizedVehicle; receipt: string; message?: never } | { message: string; vehicle?: never; receipt?: never };
