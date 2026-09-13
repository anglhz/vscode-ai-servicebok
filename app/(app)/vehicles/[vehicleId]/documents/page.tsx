import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { DocumentCard } from "@/components/documents/document-card";
import { DocumentUpload } from "@/components/documents/document-upload";
import { getDocumentsForVehicle } from "@/services/documents";

export const metadata: Metadata = { title: "Dokument" };
export default async function DocumentsPage({ params, searchParams }: { params: Promise<{ vehicleId: string }>; searchParams: Promise<{ page?: string }> }) {
  const { vehicleId } = await params;
  const requestedPage = Number((await searchParams).page ?? 1);
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 10000 ? requestedPage : 1;
  const { documents, hasMore } = await getDocumentsForVehicle(vehicleId, page);
  return <><Link href={`/vehicles/${vehicleId}`} className="mb-4 inline-flex min-h-11 items-center text-sm text-primary underline">Tillbaka till fordonet</Link>
    <PageHeader title="Dokument" description="Kvitton, protokoll och bilder för ditt fordon." />
    <div className="space-y-6"><DocumentUpload vehicleId={vehicleId} />
      {documents.length ? <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{documents.map(document => <DocumentCard key={document.id} document={document} />)}</div> :
        <EmptyState title="Inga dokument ännu" description="Välj en fil ovan för att lägga till ditt första dokument." />}
      <nav aria-label="Dokumentsidor" className="flex flex-wrap gap-3">
        {page > 1 && <Button asChild variant="outline" className="min-h-12"><Link href={`?page=${page - 1}`}>Nyare dokument</Link></Button>}
        {hasMore && <Button asChild variant="outline" className="min-h-12"><Link href={`?page=${page + 1}`}>Äldre dokument</Link></Button>}
      </nav>
    </div>
  </>;
}
