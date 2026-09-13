import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { requireVehicleAccess } from "@/lib/permissions/vehicle";
import { createClient, createReadOnlyClient } from "@/lib/supabase/server";
import { createVehicleSchema, vehicleSchema } from "@/lib/validation/vehicle";

const columns = "id, vehicle_type, make, model, registration_number, vin, model_year, current_mileage, fuel_type";

export async function getVehiclesForCurrentUser() {
  await requireUser();
  const supabase = await createReadOnlyClient();
  // RLS applies the same active-owner rule to this list and direct API requests.
  const { data, error } = await supabase.from("vehicles").select(columns).order("created_at", { ascending: false });
  if (error) throw new Error("Fordonen kunde inte hämtas.");
  return z.array(vehicleSchema).parse(data);
}

export async function getVehicleForCurrentUser(vehicleId: string) {
  const { supabase } = await requireVehicleAccess(vehicleId);
  const { data, error } = await supabase.from("vehicles").select(columns).eq("id", vehicleId).maybeSingle();
  if (error) throw new Error("Fordonet kunde inte hämtas.");
  // RLS rechecks ownership if it changed after the helper ran.
  if (!data) notFound();
  return vehicleSchema.parse(data);
}

export async function createVehicle(input: unknown) {
  await requireUser();
  const value = createVehicleSchema.parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_vehicle", {
    p_vehicle_type: value.vehicle_type, p_make: value.make, p_model: value.model,
    p_registration_number: value.registration_number, p_vin: value.vin,
    p_model_year: value.model_year, p_current_mileage: value.current_mileage, p_fuel_type: value.fuel_type,
  });
  if (error) throw new Error("Fordonet kunde inte sparas.");
  return z.uuid().parse(data);
}
