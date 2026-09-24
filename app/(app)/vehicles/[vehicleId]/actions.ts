"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { deleteEmptyVehicle, VehicleHasHistoryError } from "@/services/vehicles";

export async function deleteMisregisteredVehicle(vehicleId: string, _state: { message?: string }, formData: FormData): Promise<{ message?: string }> {
  await requireUser();
  if (formData.get("confirm") !== "delete") return { message: "Bekräfta att du vill ta bort fordonet." };
  try { await deleteEmptyVehicle(vehicleId); }
  catch (error) {
    return { message: error instanceof VehicleHasHistoryError
      ? "Fordonet kan inte tas bort eftersom det redan har historik."
      : "Fordonet kunde inte tas bort. Försök igen eller kontrollera att du fortfarande äger det." };
  }
  revalidatePath("/vehicles");
  revalidatePath(`/vehicles/${vehicleId}`);
  revalidatePath("/dashboard");
  revalidatePath("/account");
  redirect("/vehicles?deleted=1");
}
