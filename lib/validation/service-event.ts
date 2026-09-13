import { z } from "zod";
import { kronorToOre } from "@/lib/utils/money";

export const eventCategories = ["service", "repair", "inspection", "tires", "oil", "brakes", "timing_belt", "battery", "accessory", "damage", "mileage", "other"] as const;
export const eventCategoryLabels: Record<typeof eventCategories[number], string> = {
  service: "Service", repair: "Reparation", inspection: "Besiktning", tires: "Däck", oil: "Olja och filter",
  brakes: "Bromsar", timing_belt: "Kamrem / kamkedja", battery: "Batteri", accessory: "Tillbehör", damage: "Skada", mileage: "Miltal", other: "Övrigt",
};
export const sourceLabels = { owner: "Registrerad av ägaren", previous_owner: "Tidigare ägare", imported: "Importerad", system: "Systemregistrerad" };
const optionalText = (max: number) => z.string().trim().max(max, `Använd högst ${max} tecken.`).transform(value => value || null);
export const serviceEventFormSchema = z.object({
  category: z.enum(eventCategories, { error: "Välj kategori." }),
  title: z.string().trim().min(1, "Ange en rubrik.").max(150, "Använd högst 150 tecken."),
  event_date: z.iso.date({ error: "Ange ett giltigt datum." }).refine(value => value >= "1886-01-01" && value <= "2100-12-31", "Ange ett datum mellan 1886 och 2100."),
  mileage: z.string().trim().refine(value => value === "" || /^\d{1,10}$/.test(value), "Ange ett helt miltal, 0 eller högre.")
    .transform(value => value === "" ? null : Number(value)).pipe(z.number().int().min(0).max(2147483647, "Miltalet är för stort.").nullable()),
  cost: z.string().transform((value, context) => {
    try { return kronorToOre(value); }
    catch (error) { context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Ange en giltig kostnad." }); return z.NEVER; }
  }),
  provider_name: optionalText(150), description: optionalText(5000), notes: optionalText(5000),
});
export type ServiceEventFields = z.input<typeof serviceEventFormSchema>;
export type ServiceEventFormState = { errors?: Partial<Record<keyof ServiceEventFields, string[]>>; message?: string };
export const serviceEventSchema = z.object({
  id: z.uuid(), vehicle_id: z.uuid(), category: z.enum(eventCategories), title: z.string(), event_date: z.iso.date(),
  mileage: z.number().int().nullable(), cost_amount: z.number().int().nullable(), currency: z.literal("SEK"),
  description: z.string().nullable(), provider_name: z.string().nullable(), notes: z.string().nullable(),
  source_type: z.enum(["owner", "previous_owner", "imported", "system"]), created_at: z.string(),
  service_event_documents: z.array(z.object({ document_id: z.uuid() })).optional(),
});
export type ServiceEvent = z.infer<typeof serviceEventSchema>;
