import { z } from "zod";

export const DOCUMENT_BUCKET = "vehicle_documents";
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
export const documentMimeTypes = ["application/pdf", "image/jpeg", "image/png"] as const;
export const documentTypes = ["receipt", "invoice", "service_report", "inspection_report", "photo", "other"] as const;
export const documentTypeLabels = { receipt: "Kvitto", invoice: "Faktura", service_report: "Serviceprotokoll", inspection_report: "Besiktningsprotokoll", photo: "Foto", other: "Övrigt" };
export function sanitizeFileName(name: string) {
  return Array.from(name).filter(char => { const code = char.charCodeAt(0); return code >= 32 && code !== 127 && !(code >= 0x202a && code <= 0x202e) && !(code >= 0x2066 && code <= 0x2069); }).join("").replace(/[/\\]/g, "_").trim();
}
export function formatFileSize(size: number) {
  return size < 1024 * 1024 ? `${Math.ceil(size / 1024)} kB` : `${(size / (1024 * 1024)).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} MB`;
}
export const documentUploadSchema = z.object({
  file_name: z.string().max(512, "Filnamnet är för långt.").transform(sanitizeFileName).pipe(z.string().min(1, "Ange ett filnamn.").max(180, "Filnamnet får ha högst 180 tecken.")),
  mime_type: z.enum(documentMimeTypes, { error: "Filtypen stöds inte. Välj PDF, JPEG eller PNG." }),
  file_size_bytes: z.number().int().min(1, "Filen är tom.").max(MAX_DOCUMENT_BYTES, "Filen är för stor. Max 15 MB."),
  document_type: z.enum(documentTypes, { error: "Välj dokumenttyp." }),
});
export const documentSchema = z.object({
  id: z.uuid(), vehicle_id: z.uuid(), file_name: z.string(), mime_type: z.enum(documentMimeTypes),
  file_size_bytes: z.number().int(), document_type: z.enum(documentTypes), created_at: z.string(),
  service_event_documents: z.array(z.object({ service_events: z.object({ id: z.uuid(), title: z.string() }).nullable() })).optional(),
});
export type VehicleDocument = z.infer<typeof documentSchema>;
export type DocumentActionResult = { error?: string; success?: boolean };
