import "server-only";
import { requireVehicleAccess } from "@/lib/permissions/vehicle";
import { createVehicleExportModel } from "./model";

export async function getVehicleExportData(vehicleId: string) {
  const { supabase } = await requireVehicleAccess(vehicleId);
  const { data, error } = await supabase.rpc("get_vehicle_export_data", { p_vehicle_id:vehicleId });
  if (error || !data) throw new Error("PDF kunde inte skapas. Försök igen.");
  return createVehicleExportModel(data);
}
