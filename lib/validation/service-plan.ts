import { z } from "zod";
import { eventCategories } from "./service-event";

const optionalNumber = (min: number, max = 2147483647) => z.string().trim()
  .refine(value => value === "" || /^\d{1,10}$/.test(value), "Ange ett heltal.")
  .transform(value => value === "" ? null : Number(value))
  .pipe(z.number().int().min(min, `Ange minst ${min}.`).max(max, `Ange högst ${max}.`).nullable());
const optionalDate = z.union([z.literal(""), z.iso.date({ error: "Ange ett giltigt datum." })
  .refine(value => value >= "1886-01-01" && value <= "2100-12-31", "Ange datum mellan 1886 och 2100.")]).transform(value => value || null);
const title = z.string().trim().min(1, "Ange ett namn.").max(150, "Använd högst 150 tecken.");
export const intervalFormSchema = z.object({
  name: title, category: z.enum(eventCategories), distance_interval: optionalNumber(1), month_interval: optionalNumber(1, 1200),
  last_completed_date: optionalDate, last_completed_mileage: optionalNumber(0),
}).superRefine((value, ctx) => {
  if (value.distance_interval === null && value.month_interval === null) ctx.addIssue({ code: "custom", path: ["distance_interval"], message: "Ange ett intervall i mil eller månader." });
  if (value.distance_interval !== null && value.last_completed_mileage !== null && value.distance_interval + value.last_completed_mileage > 2147483647)
    ctx.addIssue({ code: "custom", path: ["last_completed_mileage"], message: "Nästa miltal blir för stort." });
});
export const completionFormSchema = z.object({ last_completed_date: optionalDate, last_completed_mileage: optionalNumber(0) })
  .refine(value => value.last_completed_date !== null || value.last_completed_mileage !== null, { path: ["last_completed_date"], message: "Ange datum eller miltal för utförd service." });
export const reminderFormSchema = z.object({ vehicle_id: z.uuid({ error: "Välj ett fordon." }), title, due_date: optionalDate, due_mileage: optionalNumber(0) })
  .refine(value => value.due_date !== null || value.due_mileage !== null, { path: ["due_date"], message: "Ange datum eller miltal." });
export type PlanFormState = { errors?: Record<string, string[] | undefined>; message?: string };
export type IntervalFields = z.input<typeof intervalFormSchema>;
export const dueSchema = z.object({ due_date: z.iso.date().nullable(), due_mileage: z.number().int().nullable(),
  urgency: z.enum(["ok", "due_soon", "overdue", "unknown"]), remaining_days: z.number().int().nullable(), remaining_mileage: z.number().int().nullable(), priority: z.number().int() });
export type DueInfo = z.infer<typeof dueSchema>;
export const intervalSchema = dueSchema.extend({ id: z.uuid(), vehicle_id: z.uuid(), name: z.string(), category: z.enum(eventCategories),
  distance_interval: z.number().int().nullable(), month_interval: z.number().int().nullable(), last_completed_date: z.iso.date().nullable(), last_completed_mileage: z.number().int().nullable(),
  source: z.enum(["owner", "system", "external_provider"]), is_active: z.boolean() });
export type ServiceInterval = z.infer<typeof intervalSchema>;
export const reminderSchema = dueSchema.extend({ id: z.uuid(), vehicle_id: z.uuid(), user_id: z.uuid(), service_interval_id: z.uuid().nullable(), title: z.string(),
  reminder_type: z.enum(["service", "inspection", "tires", "insurance", "tax", "custom"]), status: z.enum(["active", "completed", "dismissed"]),
  make: z.string(), model: z.string(), registration_number: z.string().nullable() });
export type Reminder = z.infer<typeof reminderSchema>;
