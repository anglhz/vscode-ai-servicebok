import "server-only";
import type { NormalizedVehicle } from "./types";
import { HttpVehicleProvider } from "./providers/http";

export interface VehicleProvider {
  lookupByRegistrationNumber(registrationNumber: string): Promise<NormalizedVehicle>;
}

export function getVehicleProvider(): VehicleProvider | null {
  if (process.env.VEHICLE_PROVIDER !== "http-json" || !process.env.VEHICLE_API_KEY || !process.env.VEHICLE_API_BASE_URL) return null;
  try { return new HttpVehicleProvider(process.env.VEHICLE_API_BASE_URL, process.env.VEHICLE_API_KEY); }
  catch { return null; }
}
