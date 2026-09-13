import "server-only";
import { requireUser } from "@/lib/auth/session";
import { getVehicleProvider } from "./provider";
import { lookupMessages, lookupRegistrationSchema, normalizedVehicleSchema, VehicleLookupError, type LookupResult } from "./types";
import { signLookup } from "./receipt";

// Bounded per-process protection. A provider account quota is also needed when scaling.
const attempts = new Map<string, { count: number; until: number }>();
export function allowLookup(user: string, now = Date.now()) {
  for (const [id, entry] of attempts) if (entry.until <= now) attempts.delete(id);
  const entry = attempts.get(user);
  if (!entry) {
    if (attempts.size >= 1000) return false;
    attempts.set(user, { count: 1, until: now + 60_000 }); return true;
  }
  if (entry.count >= 10) return false;
  entry.count++; return true;
}
export async function lookupVehicle(input: unknown): Promise<LookupResult> {
  const user = await requireUser();
  const parsed = lookupRegistrationSchema.safeParse(input);
  if (!parsed.success) return { message: "Ange ett registreringsnummer med bokstäver och siffror." };
  if (!allowLookup(user.id)) return { message: lookupMessages.rate_limit };
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
