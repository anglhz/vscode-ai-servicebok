import "server-only";
import { requireUser } from "@/lib/auth/session";
import { getVehicleProvider } from "./provider";
import { lookupMessages, lookupRegistrationSchema, normalizedVehicleSchema, VehicleLookupError, type LookupResult } from "./types";
import { signLookup } from "./receipt";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit";

export async function lookupVehicle(input: unknown): Promise<LookupResult> {
  const user = await requireUser();
  const parsed = lookupRegistrationSchema.safeParse(input);
  if (!parsed.success) return { message: "Ange ett registreringsnummer med bokstäver och siffror." };
  try { await enforceRateLimit("vehicle_lookup"); }
  catch (error) { return { message: lookupMessages[error instanceof RateLimitExceededError ? "rate_limit" : "unavailable"] }; }
  const provider = getVehicleProvider();
  if (!provider || Buffer.byteLength(process.env.VEHICLE_LOOKUP_SIGNING_SECRET ?? "") < 32) return { message: lookupMessages.unavailable };
  try {
    const vehicle = normalizedVehicleSchema.parse(await provider.lookupByRegistrationNumber(parsed.data));
    if (vehicle.registration_number !== parsed.data) throw new VehicleLookupError("invalid_response");
    return { vehicle, receipt: signLookup(user.id, vehicle) };
  } catch (error) {
    return { message: lookupMessages[error instanceof VehicleLookupError ? error.code : "provider_error"] };
  }
}
