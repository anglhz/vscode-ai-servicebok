import Link from "next/link";
import { FileText } from "lucide-react";
import { DocumentActions } from "@/components/documents/document-actions";
import { documentTypeLabels, formatFileSize, sanitizeFileName, type VehicleDocument } from "@/lib/validation/document";

export function DocumentCard({ document }: { document: VehicleDocument }) {
  return <article className="min-w-0 space-y-3 rounded-lg border bg-card p-4">
    <div className="flex items-start gap-3"><FileText className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0"><p className="text-xs text-muted-foreground">{documentTypeLabels[document.document_type]}</p>
        <h3 className="break-all font-semibold">{sanitizeFileName(document.file_name)}</h3></div></div>
    <p className="flex flex-wrap gap-3 text-xs text-muted-foreground"><time dateTime={document.created_at}>{new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date(document.created_at))}</time>
      <span>{document.mime_type === "application/pdf" ? "PDF" : document.mime_type === "image/jpeg" ? "JPEG" : "PNG"}</span><span>{formatFileSize(document.file_size_bytes)}</span></p>
    {document.service_event_documents?.map(link => link.service_events && <Link key={link.service_events.id} href={`/vehicles/${document.vehicle_id}/events/${link.service_events.id}`}
      className="block min-h-11 break-words py-2 text-sm text-primary underline underline-offset-4">{link.service_events.title}</Link>)}
    <DocumentActions vehicleId={document.vehicle_id} documentId={document.id} />
  </article>;
}
