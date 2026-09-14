"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVehicleAccess } from "@/lib/permissions/vehicle";
import { intervalFormSchema, completionFormSchema, type PlanFormState } from "@/lib/validation/service-plan";
import { createServiceInterval, updateServiceInterval, completeServiceInterval, deactivateServiceInterval } from "@/services/service-intervals";

function refresh(vehicleId: string) {
  revalidatePath(`/vehicles/${vehicleId}`, "layout"); revalidatePath("/dashboard"); revalidatePath("/reminders");
}
export async function saveInterval(vehicleId: string, intervalId: string | null, complete: boolean, _state: PlanFormState, form: FormData): Promise<PlanFormState> {
  await requireVehicleAccess(vehicleId);
  const input = Object.fromEntries(form.entries()); const parsed = (complete ? completionFormSchema : intervalFormSchema).safeParse(input);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  try {
    if (complete && intervalId) await completeServiceInterval(vehicleId, intervalId, input);
    else if (complete) return { message: "Välj ett serviceintervall." };
    else if (intervalId) await updateServiceInterval(vehicleId, intervalId, input);
    else await createServiceInterval(vehicleId, input);
  } catch { return { message: "Serviceplanen kunde inte sparas. Kontrollera uppgifterna och försök igen." }; }
  refresh(vehicleId); redirect(`/vehicles/${vehicleId}/service`);
}
export async function deactivateInterval(vehicleId: string, intervalId: string, confirmed: boolean): Promise<PlanFormState> {
  await requireVehicleAccess(vehicleId);
  if (confirmed !== true) return { message: "Bekräfta att du vill avaktivera intervallet." };
  try { await deactivateServiceInterval(vehicleId, intervalId); }
  catch { return { message: "Intervallet kunde inte avaktiveras. Försök igen." }; }
  refresh(vehicleId); return {};
}
