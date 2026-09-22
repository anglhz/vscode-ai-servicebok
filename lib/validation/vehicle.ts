import { z } from "zod";
import { normalizeRegistrationNumber } from "@/lib/utils/format";

export const vehicleTypes = ["car", "motorcycle", "moped", "motorhome", "caravan", "other"] as const;
export const vehicleTypeLabels: Record<typeof vehicleTypes[number], string> = {
  car: "Bil", motorcycle: "MC", moped: "Moped", motorhome: "Husbil", caravan: "Husvagn", other: "Annat fordon",
};
export function normalizeVin(value: string) { return value.replace(/\s/g, "").toUpperCase(); }

const optionalIdentifier = (max: number, normalize: (value: string) => string) =>
  z.string().max(256, "Texten är för lång.").transform(normalize)
    .pipe(z.string().max(max, `Använd högst ${max} tecken.`)).transform(value => value || null);
const optionalInteger = (min: number, max: number, message: string) =>
  z.string().trim().refine(value => value === "" || /^\d+$/.test(value), message)
    .transform(value => value === "" ? null : Number(value))
    .pipe(z.number().int(message).min(min, message).max(max, message).nullable());

export const createVehicleSchema = z.object({
  vehicle_type: z.enum(vehicleTypes, { error: "Välj en fordonstyp." }),
  make: z.string().trim().min(1, "Ange märke.").max(100, "Använd högst 100 tecken."),
  model: z.string().trim().min(1, "Ange modell.").max(100, "Använd högst 100 tecken."),
  registration_number: optionalIdentifier(32, normalizeRegistrationNumber),
  vin: optionalIdentifier(64, normalizeVin),
  model_year: optionalInteger(1886, 2100, "Ange ett helt år mellan 1886 och 2100."),
  current_mileage: optionalInteger(0, 2147483647, "Ange ett helt miltal mellan 0 och 2 147 483 647."),
  fuel_type: z.string().trim().max(50, "Använd högst 50 tecken.").transform(value => value || null),
});
export type VehicleInput = z.output<typeof createVehicleSchema>;
export type VehicleField = keyof z.input<typeof createVehicleSchema>;
export type VehicleFormState = { errors?: Partial<Record<VehicleField, string[]>>; message?: string; premiumRequired?: boolean };

// Domain response validation, not fabricated Supabase-generated database types.
export const vehicleSchema = z.object({
  id: z.uuid(), vehicle_type: z.enum(vehicleTypes), make: z.string(), model: z.string(),
  registration_number: z.string().nullable(), vin: z.string().nullable(),
  model_year: z.number().int().nullable(), current_mileage: z.number().int().nullable(),
  fuel_type: z.string().nullable(),
});
export type Vehicle = z.infer<typeof vehicleSchema>;
