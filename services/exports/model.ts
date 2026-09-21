import { z } from "zod";
import { eventCategories, eventCategoryLabels, sourceLabels } from "@/lib/validation/service-event";
import { vehicleTypes, vehicleTypeLabels } from "@/lib/validation/vehicle";
import { formatMileage } from "@/lib/utils/format";

const nonnegativeInteger = z.number().int().nonnegative().max(2147483647);
export const vehicleExportSchema = z.object({
  generated_at: z.iso.datetime({ offset: true }),
  vehicle: z.object({ registration_number:z.string().nullable(), make:z.string(), model:z.string(), model_year:z.number().int().nullable(),
    vehicle_type:z.enum(vehicleTypes), vin:z.string().nullable(), current_mileage:nonnegativeInteger.nullable() }),
  events: z.array(z.object({ event_date:z.iso.date(), category:z.enum(eventCategories), title:z.string(), mileage:nonnegativeInteger.nullable(),
    cost_amount:nonnegativeInteger.nullable(), currency:z.literal("SEK"), provider_name:z.string().nullable(), description:z.string().nullable(),
    source_type:z.enum(["owner","previous_owner","imported","system"]), has_document:z.boolean() })),
  intervals: z.array(z.object({ name:z.string(), due_date:z.iso.date().nullable(), due_mileage:nonnegativeInteger.nullable(), urgency:z.enum(["ok","due_soon","overdue","unknown"]) })),
});
export type VehicleExportData = z.infer<typeof vehicleExportSchema> & {
  summary: { eventCount:number; firstDate:string|null; lastDate:string|null; totalCostOre:string; costCount:number };
};
export function createVehicleExportModel(input: unknown): VehicleExportData {
  // Zod strips extra fields even if an upstream query accidentally broadens later.
  const data = vehicleExportSchema.parse(input);
  data.events.sort((a,b) => a.event_date.localeCompare(b.event_date));
  const costs = data.events.filter(event => event.cost_amount !== null);
  return { ...data, summary: {
    eventCount:data.events.length, firstDate:data.events[0]?.event_date ?? null, lastDate:data.events.at(-1)?.event_date ?? null,
    totalCostOre:costs.reduce((sum,event) => sum + BigInt(event.cost_amount!), BigInt(0)).toString(), costCount:costs.length,
  } };
}
export function formatExportCost(ore: string | number): string {
  const amount = BigInt(ore);
  return `${new Intl.NumberFormat("sv-SE").format(amount / BigInt(100))},${(amount % BigInt(100)).toString().padStart(2,"0")} SEK`;
}
export function formatExportDate(date: string): string {
  return new Intl.DateTimeFormat("sv-SE", { dateStyle:"long", timeZone:"Europe/Stockholm" }).format(new Date(date.length === 10 ? `${date}T12:00:00Z` : date));
}
export function exportFilename(data: VehicleExportData): string {
  const registration = data.vehicle.registration_number?.normalize("NFKD").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,32) || "fordon";
  const year = new Intl.DateTimeFormat("sv-SE", { year:"numeric",timeZone:"Europe/Stockholm" }).format(new Date(data.generated_at));
  return `servicebok_${registration}_${year}.pdf`;
}
export const exportLabels = { category:eventCategoryLabels, source:sourceLabels, vehicleType:vehicleTypeLabels,
  urgency:{ok:"Kommande",due_soon:"Snart dags",overdue:"Försenad",unknown:"Okänd"} };
export { formatMileage };
