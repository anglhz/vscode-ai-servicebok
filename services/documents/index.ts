import "server-only";
import { checkPlanLimit } from "@/lib/permissions/plan-limit";
import { z } from "zod";
import { requireVehicleAccess } from "@/lib/permissions/vehicle";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_BUCKET, documentSchema, documentUploadSchema } from "@/lib/validation/document";

const reservationSchema = z.object({ id: z.uuid(), storage_path: z.string() });
const columns = "id, vehicle_id, file_name, mime_type, file_size_bytes, document_type, created_at, service_event_documents(service_events(id,title))";
function documentId(value: string) { return z.uuid().parse(value); }

export async function cleanupDocuments(vehicleId: string) {
  await requireVehicleAccess(vehicleId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("document_cleanup_candidates", { p_vehicle_id: vehicleId });
  if (error) return; // Persistent candidates are retried on the next upload/cleanup run.
  for (const item of z.array(reservationSchema).parse(data)) {
    const { error: removeError } = await supabase.storage.from(DOCUMENT_BUCKET).remove([item.storage_path]);
    if (!removeError) await supabase.rpc("complete_document_cleanup", { p_vehicle_id: vehicleId, p_document_id: item.id });
  }
}
export async function createDocument(vehicleId: string, eventId: string | null, input: unknown) {
  await requireVehicleAccess(vehicleId);
  if (eventId !== null) documentId(eventId);
  const value = documentUploadSchema.parse(input);
  await cleanupDocuments(vehicleId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_document", { p_vehicle_id: vehicleId, p_event_id: eventId,
    p_file_name: value.file_name, p_mime_type: value.mime_type, p_file_size_bytes: value.file_size_bytes, p_document_type: value.document_type });
  checkPlanLimit(error);
  if (error) throw new Error("Dokumentet kunde inte förberedas.");
  const document = z.array(reservationSchema).length(1).parse(data)[0];
  const { data: signed, error: signError } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUploadUrl(document.storage_path, { upsert: false });
  if (signError || !signed) {
    await softDeleteDocument(vehicleId, document.id, true);
    throw new Error("Dokumentet kunde inte förberedas.");
  }
  return { id: document.id, path: document.storage_path, token: signed.token };
}
export async function finalizeDocument(vehicleId: string, id: string) {
  await requireVehicleAccess(vehicleId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("finalize_document", { p_vehicle_id: vehicleId, p_document_id: documentId(id) });
  if (error) throw new Error("Dokumentet kunde inte bekräftas.");
}
export async function softDeleteDocument(vehicleId: string, id: string, pendingOnly = false) {
  await requireVehicleAccess(vehicleId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("soft_delete_document", { p_vehicle_id: vehicleId, p_document_id: documentId(id), p_pending_only: pendingOnly });
  if (error) throw new Error("Dokumentet kunde inte tas bort.");
  if (typeof data === "string") {
    // Metadata is hidden first. Failed physical removals remain cleanup candidates.
    await supabase.storage.from(DOCUMENT_BUCKET).remove([data]);
  }
}
export async function createDocumentDownloadUrl(vehicleId: string, id: string) {
  const { supabase } = await requireVehicleAccess(vehicleId);
  const { data, error } = await supabase.from("documents").select("storage_path, file_name")
    .eq("vehicle_id", vehicleId).eq("id", documentId(id)).eq("upload_status", "ready").is("deleted_at", null).maybeSingle();
  if (error || !data) throw new Error("Dokumentet kunde inte öppnas.");
  const document = z.object({ storage_path: z.string(), file_name: z.string() }).parse(data);
  const { data: signed, error: signError } = await supabase.storage.from(DOCUMENT_BUCKET)
    .createSignedUrl(document.storage_path, 300, { download: document.file_name });
  if (signError || !signed) throw new Error("Dokumentet kunde inte öppnas.");
  return signed.signedUrl;
}
export async function getDocumentsForVehicle(vehicleId: string, page = 1) {
  const { supabase } = await requireVehicleAccess(vehicleId);
  const offset = (z.number().int().min(1).max(10000).parse(page) - 1) * 30;
  const { data, error } = await supabase.from("documents").select(columns).eq("vehicle_id", vehicleId)
    .eq("upload_status", "ready").is("deleted_at", null).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 30);
  if (error) throw new Error("Dokumenten kunde inte hämtas.");
  const documents = z.array(documentSchema).parse(data);
  return { documents: documents.slice(0, 30), hasMore: documents.length > 30 };
}
export async function getDocumentsForEvent(vehicleId: string, eventId: string) {
  const { supabase } = await requireVehicleAccess(vehicleId);
  documentId(eventId);
  const { data, error } = await supabase.from("documents")
    .select("id, vehicle_id, file_name, mime_type, file_size_bytes, document_type, created_at, service_event_documents!inner(service_event_id)")
    .eq("vehicle_id", vehicleId).eq("service_event_documents.service_event_id", eventId)
    .eq("upload_status", "ready").is("deleted_at", null).order("created_at", { ascending: false });
  if (error) throw new Error("Dokumenten kunde inte hämtas.");
  // Event links are filtered in SQL; only presentation fields are returned here.
  return z.array(documentSchema.omit({ service_event_documents: true })).parse(data);
}
