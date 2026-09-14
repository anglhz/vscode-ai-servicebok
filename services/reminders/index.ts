import "server-only";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { requireVehicleAccess } from "@/lib/permissions/vehicle";
import { createClient, createReadOnlyClient } from "@/lib/supabase/server";
import { reminderFormSchema, reminderSchema } from "@/lib/validation/service-plan";

export async function getReminders(page = 1, size = 30) {
  const user = await requireUser(); z.number().int().min(1).max(30).parse(size);
  const start = (z.number().int().min(1).max(10000).parse(page) - 1) * size;
  const supabase = await createReadOnlyClient();
  const { data, error } = await supabase.from("reminder_overview").select("*").eq("user_id", user.id).eq("status", "active")
    .order("priority").order("due_date", { nullsFirst: false }).order("remaining_mileage", { nullsFirst: false }).order("id").range(start, start + size);
  if (error) throw new Error("Påminnelserna kunde inte hämtas.");
  const values = z.array(reminderSchema).parse(data);
  return { reminders: values.slice(0, size), hasMore: values.length > size };
}
export async function createCustomReminder(input: unknown) {
  const value = reminderFormSchema.parse(input); await requireVehicleAccess(value.vehicle_id);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_custom_reminder", { p_vehicle_id: value.vehicle_id, p_title: value.title, p_due_date: value.due_date, p_due_mileage: value.due_mileage });
  if (error) throw new Error("Påminnelsen kunde inte sparas.");
  return z.uuid().parse(data);
}
export async function setReminderStatus(vehicleId: string, reminderId: string, status: "completed" | "dismissed") {
  await requireVehicleAccess(vehicleId); z.uuid().parse(reminderId); z.enum(["completed", "dismissed"]).parse(status);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_reminder_status", { p_vehicle_id: vehicleId, p_reminder_id: reminderId, p_status: status });
  if (error) throw new Error("Påminnelsen kunde inte uppdateras.");
}
