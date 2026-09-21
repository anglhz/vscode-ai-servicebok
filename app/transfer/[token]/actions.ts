"use server";
import { cookies } from "next/headers";
import { PlanLimitError } from "@/lib/permissions/plan-limit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptVehicleTransfer } from "@/services/vehicle-transfers";
import { transferCookieName } from "@/lib/auth/transfer-continuation";
import type { TransferState } from "@/lib/validation/transfer";

export async function acceptTransfer(token: string, _state: TransferState, form: FormData): Promise<TransferState> {
  if (form.get("confirm") !== "yes") return { message: "Bekräfta att du vill ta över fordonet." };
  let vehicleId: string;
  try { vehicleId = await acceptVehicleTransfer(token); }
  catch (error) {
    if (error instanceof PlanLimitError) return { message: error.message, premiumRequired: true };
    return { message: "Överföringen kunde inte accepteras. Länken kan ha gått ut, avbrutits eller redan använts. Logga in igen om din session har gått ut." };
  }
  (await cookies()).delete(transferCookieName);
  revalidatePath("/", "layout");
  redirect(`/vehicles/${vehicleId}?transferred=1`);
}
