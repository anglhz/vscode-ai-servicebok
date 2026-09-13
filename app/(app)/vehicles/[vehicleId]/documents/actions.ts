"use server";
import { revalidatePath } from "next/cache";
import { createDocument, finalizeDocument, softDeleteDocument, createDocumentDownloadUrl } from "@/services/documents";
import { documentUploadSchema, type DocumentActionResult } from "@/lib/validation/document";

function refresh(vehicleId: string) { revalidatePath(`/vehicles/${vehicleId}`, "layout"); }
export async function prepareUpload(vehicleId: string, eventId: string | null, input: unknown) {
  const parsed = documentUploadSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try { return { upload: await createDocument(vehicleId, eventId, input) }; }
  catch { return { error: "Dokumentet kunde inte förberedas. Försök igen." }; }
}
export async function confirmUpload(vehicleId: string, id: string): Promise<DocumentActionResult> {
  try { await finalizeDocument(vehicleId, id); }
  catch { return { error: "Dokumentet kunde inte bekräftas. Försök igen." }; }
  refresh(vehicleId); return { success: true };
}
export async function cancelUpload(vehicleId: string, id: string): Promise<DocumentActionResult> {
  try { await softDeleteDocument(vehicleId, id, true); }
  catch { return { error: "Uppladdningen kunde inte avbrytas just nu." }; }
  refresh(vehicleId); return { success: true };
}
export async function removeDocument(vehicleId: string, id: string, confirmed: boolean): Promise<DocumentActionResult> {
  if (confirmed !== true) return { error: "Bekräfta att du vill ta bort dokumentet." };
  try { await softDeleteDocument(vehicleId, id); }
  catch { return { error: "Dokumentet kunde inte tas bort. Försök igen." }; }
  refresh(vehicleId); return { success: true };
}
export async function openDocument(vehicleId: string, id: string) {
  try { return { url: await createDocumentDownloadUrl(vehicleId, id) }; }
  catch { return { error: "Dokumentet kunde inte öppnas. Försök igen." }; }
}
