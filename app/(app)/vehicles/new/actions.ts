"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createVehicleSchema, type VehicleFormState } from "@/lib/validation/vehicle";
import { createVehicle, DuplicateVehicleError, InvalidVehicleLookupError } from "@/services/vehicles";
import { lookupVehicle } from "@/services/vehicle-data";
import { PlanLimitError } from "@/lib/permissions/plan-limit";

export async function searchVehicle(registration: string) { return lookupVehicle(registration); }

export async function saveVehicle(_state: VehicleFormState, formData: FormData): Promise<VehicleFormState> {
  await requireUser();
  const input = Object.fromEntries(formData.entries());
  const parsed = createVehicleSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  let vehicleId: string;
  const receipt = formData.get("lookup_receipt");
  if (receipt && (typeof receipt !== "string" || formData.get("confirmed") !== "yes")) return { message: "Bekräfta fordonsuppgifterna innan du sparar." };
  try { vehicleId = await createVehicle(input, typeof receipt === "string" ? receipt : undefined); }
  catch (error) {
    if (error instanceof PlanLimitError) return { message: error.message, premiumRequired: true };
    if (error instanceof DuplicateVehicleError) return { message: "Fordonet finns redan registrerat i Servicebok. Ingen åtkomst har ändrats." };
    if (error instanceof InvalidVehicleLookupError) return { message: "Sökningen har gått ut eller ändrats. Sök igen eller lägg till fordonet manuellt." };
    return { message: "Fordonet kunde inte sparas. Försök igen." };
  }
  revalidatePath("/vehicles");
  revalidatePath("/dashboard");
  redirect(`/vehicles/${vehicleId}`);
}
