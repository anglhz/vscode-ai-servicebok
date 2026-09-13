"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVehicleAccess } from "@/lib/permissions/vehicle";
import { serviceEventFormSchema, type ServiceEventFormState } from "@/lib/validation/service-event";
import { createServiceEvent, updateServiceEvent, deleteServiceEvent } from "@/services/service-events";

function refresh(vehicleId: string) {
  revalidatePath(`/vehicles/${vehicleId}`, "layout");
  revalidatePath("/vehicles"); revalidatePath("/dashboard"); revalidatePath("/new");
}
export async function saveEvent(vehicleId: string, eventId: string | null, _state: ServiceEventFormState, form: FormData): Promise<ServiceEventFormState> {
  await requireVehicleAccess(vehicleId);
  const input = Object.fromEntries(form.entries());
  const parsed = serviceEventFormSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  let savedId: string;
  try { savedId = eventId === null ? await createServiceEvent(vehicleId, input) : await updateServiceEvent(vehicleId, eventId, input); }
  catch { return { message: "Händelsen kunde inte sparas. Försök igen." }; }
  refresh(vehicleId);
  redirect(`/vehicles/${vehicleId}/events/${savedId}`);
}
export async function removeEvent(vehicleId: string, eventId: string, _state: ServiceEventFormState, form: FormData): Promise<ServiceEventFormState> {
  await requireVehicleAccess(vehicleId);
  if (form.get("confirm") !== "yes") return { message: "Bekräfta att du vill ta bort händelsen." };
  try { await deleteServiceEvent(vehicleId, eventId); }
  catch { return { message: "Händelsen kunde inte tas bort. Försök igen." }; }
  refresh(vehicleId);
  redirect(`/vehicles/${vehicleId}`);
}
