"use server";
import { revalidatePath } from "next/cache";
import { createVehicleTransfer, cancelVehicleTransfer } from "@/services/vehicle-transfers";
import type { TransferState } from "@/lib/validation/transfer";

export async function startTransfer(vehicleId: string, _state: TransferState, form: FormData): Promise<TransferState> {
  if (form.get("confirm") !== "yes") return { message: "Bekräfta att du vill överföra fordonet." };
  let result: TransferState;
  try { result = await createVehicleTransfer(vehicleId, form.getAll("document")); }
  catch { return { message: "Överföringen kunde inte skapas. Kontrollera dokumentvalet och om en överföring redan väntar." }; }
  revalidatePath(`/vehicles/${vehicleId}`);
  revalidatePath(`/vehicles/${vehicleId}/transfer`);
  return result;
}
export async function cancelTransfer(vehicleId: string, transferId: string, _state: TransferState, form: FormData): Promise<TransferState> {
  if (form.get("confirm") !== "yes") return { message: "Bekräfta att du vill avbryta överföringen." };
  try { await cancelVehicleTransfer(vehicleId, transferId); }
  catch { return { message: "Överföringen kunde inte avbrytas. Uppdatera sidan och försök igen." }; }
  revalidatePath(`/vehicles/${vehicleId}`);
  revalidatePath(`/vehicles/${vehicleId}/transfer`);
  return { cancelled: true };
}
