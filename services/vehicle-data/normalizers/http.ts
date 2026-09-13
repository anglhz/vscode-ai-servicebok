import { z } from "zod";
import { normalizedVehicleSchema } from "../types";

// Explicit adapter contract, not a claim of compatibility with a named vendor.
const responseSchema = z.object({ vehicle: z.object({
  registrationNumber: z.string(), vin: z.string().nullable().optional(),
  make: z.string(), model: z.string(), modelYear: z.number().nullable().optional(),
  vehicleYear: z.number().nullable().optional(), fuelType: z.string().nullable().optional(),
  powerKw: z.number().nullable().optional(), vehicleType: z.string(),
  firstRegistrationDate: z.string().nullable().optional(), color: z.string().nullable().optional(),
  id: z.string().nullable().optional(),
}) });
export function normalizeHttpVehicle(input: unknown) {
  const { vehicle: value } = responseSchema.parse(input);
  return normalizedVehicleSchema.parse({
    registration_number: value.registrationNumber, vin: value.vin || null,
    make: value.make, model: value.model, model_year: value.modelYear ?? null,
    vehicle_year: value.vehicleYear ?? null, fuel_type: value.fuelType || null,
    power_kw: value.powerKw ?? null, vehicle_type: value.vehicleType,
    first_registration_date: value.firstRegistrationDate ?? null, color: value.color || null,
    external_provider: "http-json", external_provider_id: value.id || null,
  });
}
