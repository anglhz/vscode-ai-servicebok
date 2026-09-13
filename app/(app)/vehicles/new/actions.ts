"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createVehicleSchema, type VehicleFormState } from "@/lib/validation/vehicle";
import { createVehicle } from "@/services/vehicles";

export async function saveVehicle(_state: VehicleFormState, formData: FormData): Promise<VehicleFormState> {
  await requireUser();
  const input = Object.fromEntries(formData.entries());
  const parsed = createVehicleSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  let vehicleId: string;
  try { vehicleId = await createVehicle(input); }
  catch { return { message: "Fordonet kunde inte sparas. Försök igen." }; }
  revalidatePath("/vehicles");
  revalidatePath("/dashboard");
  redirect(`/vehicles/${vehicleId}`);
}
