import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireVehicleAccess } from "@/lib/permissions/vehicle";
import { createClient } from "@/lib/supabase/server";
import { serviceEventFormSchema, serviceEventSchema } from "@/lib/validation/service-event";

const columns = "id, vehicle_id, category, title, event_date, mileage, cost_amount, currency, description, provider_name, notes, source_type, created_at, service_event_documents(document_id)";
export async function getServiceEventsForVehicle(vehicleId: string, page = 1) {
  const { supabase } = await requireVehicleAccess(vehicleId);
  const offset = (z.number().int().min(1).max(10000).parse(page) - 1) * 30;
  const { data, error } = await supabase.from("service_events").select(columns)
    .eq("vehicle_id", vehicleId).is("deleted_at", null).order("event_date", { ascending: false })
    .order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 30);
  if (error) throw new Error("Historiken kunde inte hämtas.");
  const events = z.array(serviceEventSchema).parse(data);
  return { events: events.slice(0, 30), hasMore: events.length > 30 };
}
export async function getServiceEventForVehicle(vehicleId: string, eventId: string) {
  const { supabase } = await requireVehicleAccess(vehicleId);
  if (!z.uuid().safeParse(eventId).success) notFound();
  const { data, error } = await supabase.from("service_events").select(columns)
    .eq("vehicle_id", vehicleId).eq("id", eventId).is("deleted_at", null).maybeSingle();
  if (error) throw new Error("Händelsen kunde inte hämtas.");
  if (!data) notFound();
  return serviceEventSchema.parse(data);
}
async function save(vehicleId: string, input: unknown, eventId?: string) {
  await requireVehicleAccess(vehicleId);
  if (eventId !== undefined && !z.uuid().safeParse(eventId).success) notFound();
  const value = serviceEventFormSchema.parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(eventId ? "update_service_event" : "create_service_event", {
    p_vehicle_id: vehicleId, ...(eventId ? { p_event_id: eventId } : {}),
    p_category: value.category, p_title: value.title, p_event_date: value.event_date,
    p_mileage: value.mileage, p_cost_amount: value.cost, p_provider_name: value.provider_name,
    p_description: value.description, p_notes: value.notes,
  });
  if (error) throw new Error("Händelsen kunde inte sparas.");
  return z.uuid().parse(data);
}
export async function createServiceEvent(vehicleId: string, input: unknown) { return save(vehicleId, input); }
export async function updateServiceEvent(vehicleId: string, eventId: string, input: unknown) { return save(vehicleId, input, eventId); }
export async function deleteServiceEvent(vehicleId: string, eventId: string) {
  await requireVehicleAccess(vehicleId);
  if (!z.uuid().safeParse(eventId).success) notFound();
  const supabase = await createClient();
  const { error } = await supabase.rpc("soft_delete_service_event", { p_vehicle_id: vehicleId, p_event_id: eventId });
  if (error) throw new Error("Händelsen kunde inte tas bort.");
}
