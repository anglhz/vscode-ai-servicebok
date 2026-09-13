import { DocumentCard } from "@/components/documents/document-card";
import { DocumentUpload } from "@/components/documents/document-upload";
import { getDocumentsForEvent } from "@/services/documents";

export async function EventDocuments({ vehicleId, eventId }: { vehicleId: string; eventId: string }) {
  const documents = await getDocumentsForEvent(vehicleId, eventId);
  return <section className="mt-8 space-y-4" aria-labelledby="documents-title"><h2 id="documents-title" className="text-xl font-semibold">Dokument</h2>
    {documents.length ? <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{documents.map(document => <DocumentCard key={document.id} document={document} />)}</div> : <p className="text-sm text-muted-foreground">Inga dokument bifogade ännu.</p>}
    <DocumentUpload vehicleId={vehicleId} eventId={eventId} />
  </section>;
}
