"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { reminderFormSchema, type PlanFormState } from "@/lib/validation/service-plan";
import { createCustomReminder, setReminderStatus } from "@/services/reminders";

export async function saveReminder(_state: PlanFormState, form: FormData): Promise<PlanFormState> {
  await requireUser(); const input = Object.fromEntries(form.entries()); const parsed = reminderFormSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  try { await createCustomReminder(input); }
  catch { return { message: "Påminnelsen kunde inte sparas. Försök igen." }; }
  revalidatePath("/reminders"); revalidatePath("/dashboard"); redirect("/reminders");
}
export async function changeReminderStatus(vehicleId: string, reminderId: string, status: "completed" | "dismissed"): Promise<PlanFormState> {
  await requireUser();
  try { await setReminderStatus(vehicleId, reminderId, status); }
  catch { return { message: "Påminnelsen kunde inte uppdateras. Försök igen." }; }
  revalidatePath("/reminders"); revalidatePath("/dashboard"); return {};
}
