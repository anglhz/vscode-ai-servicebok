import "server-only";
import { z } from "zod";
import { notFound } from "next/navigation";
import { requireVehicleAccess } from "@/lib/permissions/vehicle";
import { createClient } from "@/lib/supabase/server";
import { intervalFormSchema, completionFormSchema, intervalSchema } from "@/lib/validation/service-plan";

export async function getServiceIntervals(vehicleId: string, page = 1, size = 30) {
  const { supabase } = await requireVehicleAccess(vehicleId);
  z.number().int().min(1).max(30).parse(size);
  const start = (z.number().int().min(1).max(10000).parse(page) - 1) * size;
  const { data, error } = await supabase.from("service_interval_overview").select("*").eq("vehicle_id", vehicleId).eq("is_active", true)
    .order("priority").order("due_date", { nullsFirst: false }).order("remaining_mileage", { nullsFirst: false }).order("id").range(start, start + size);
  if (error) throw new Error("Serviceplanen kunde inte hämtas.");
  const values = z.array(intervalSchema).parse(data);
  return { intervals: values.slice(0, size), hasMore: values.length > size };
}
export async function getServiceInterval(vehicleId: string, intervalId: string) {
  const { supabase } = await requireVehicleAccess(vehicleId);
  if (!z.uuid().safeParse(intervalId).success) notFound();
  const { data, error } = await supabase.from("service_interval_overview").select("*").eq("vehicle_id", vehicleId).eq("id", intervalId).eq("is_active", true).maybeSingle();
  if (error) throw new Error("Intervallet kunde inte hämtas.");
  if (!data) notFound();
  return intervalSchema.parse(data);
}
async function save(vehicleId: string, input: unknown, intervalId?: string) {
  await requireVehicleAccess(vehicleId);
  if (intervalId !== undefined) z.uuid().parse(intervalId);
  const value = intervalFormSchema.parse(input); const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_service_interval", { p_vehicle_id: vehicleId, p_interval_id: intervalId ?? null,
    p_name: value.name, p_category: value.category, p_distance_interval: value.distance_interval, p_month_interval: value.month_interval,
    p_last_completed_date: value.last_completed_date, p_last_completed_mileage: value.last_completed_mileage });
  if (error) throw new Error("Intervallet kunde inte sparas.");
  return z.uuid().parse(data);
}
export async function createServiceInterval(vehicleId: string, input: unknown) { return save(vehicleId, input); }
export async function updateServiceInterval(vehicleId: string, intervalId: string, input: unknown) { return save(vehicleId, input, intervalId); }
export async function completeServiceInterval(vehicleId: string, intervalId: string, input: unknown) {
  await requireVehicleAccess(vehicleId); z.uuid().parse(intervalId);
  const value = completionFormSchema.parse(input); const supabase = await createClient();
  const { error } = await supabase.rpc("complete_service_interval", { p_vehicle_id: vehicleId, p_interval_id: intervalId, p_date: value.last_completed_date, p_mileage: value.last_completed_mileage });
  if (error) throw new Error("Utförd service kunde inte sparas. Kontrollera datum och miltal.");
}
export async function deactivateServiceInterval(vehicleId: string, intervalId: string) {
  await requireVehicleAccess(vehicleId); z.uuid().parse(intervalId); const supabase = await createClient();
  const { error } = await supabase.rpc("deactivate_service_interval", { p_vehicle_id: vehicleId, p_interval_id: intervalId });
  if (error) throw new Error("Intervallet kunde inte avaktiveras.");
}
