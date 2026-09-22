"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/browser";
import { DOCUMENT_BUCKET, documentMimeTypes, documentTypes, documentTypeLabels, documentUploadSchema, formatFileSize, sanitizeFileName } from "@/lib/validation/document";
import { prepareUpload, confirmUpload, cancelUpload } from "@/app/(app)/vehicles/[vehicleId]/documents/actions";

export function DocumentUpload({ vehicleId, eventId = null }: { vehicleId: string; eventId?: string | null }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState("receipt");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [premiumRequired, setPremiumRequired] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setSuccess(false); setPremiumRequired(false);
    if (!file && !pendingId) { setMessage("Välj en fil."); return; }
    setBusy(true);
    try {
      let id = pendingId;
      if (!id && file) {
        const input = { file_name: file.name, mime_type: file.type, file_size_bytes: file.size, document_type: documentType };
        const parsed = documentUploadSchema.safeParse(input);
        if (!parsed.success) { setMessage(parsed.error.issues[0].message); return; }
        const prepared = await prepareUpload(vehicleId, eventId, input);
        if (!prepared.upload) { setPremiumRequired(Boolean(prepared.premiumRequired)); setMessage(prepared.error ?? "Dokumentet kunde inte förberedas."); return; }
        const upload = prepared.upload;
        const { error } = await createClient().storage.from(DOCUMENT_BUCKET).uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
        if (error) { await cancelUpload(vehicleId, upload.id); setMessage("Dokumentet kunde inte laddas upp. Försök igen."); return; }
        id = upload.id; setPendingId(id);
      }
      if (!id) return;
      const result = await confirmUpload(vehicleId, id);
      if (result.error) { setMessage(result.error); return; }
      setPendingId(null); setFile(null); if (fileInput.current) fileInput.current.value = "";
      setSuccess(true); setMessage("Dokumentet har laddats upp."); router.refresh();
    } catch { setMessage("Dokumentet kunde inte laddas upp. Försök igen."); }
    finally { setBusy(false); }
  }
  async function cancel() {
    if (!pendingId) return;
    setBusy(true);
    try {
      const result = await cancelUpload(vehicleId, pendingId);
      if (result.error) setMessage(result.error);
      else { setPendingId(null); setMessage("Uppladdningen avbröts."); router.refresh(); }
    } catch { setMessage("Uppladdningen kunde inte avbrytas just nu."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="max-w-xl space-y-4 rounded-lg border p-4">
    <h3 className="font-semibold">Lägg till dokument</h3>
    <div className="space-y-2"><label htmlFor="document_type" className="text-sm font-medium">Dokumenttyp</label>
      <select id="document_type" value={documentType} onChange={event => setDocumentType(event.target.value)} disabled={busy || Boolean(pendingId)}
        className="min-h-12 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:ring-2 focus-visible:ring-ring">
        {documentTypes.map(type => <option key={type} value={type}>{documentTypeLabels[type]}</option>)}
      </select></div>
    <div className="space-y-2"><label htmlFor="document_file" className="text-sm font-medium">Fil, bild eller foto</label>
      <input ref={fileInput} id="document_file" type="file" accept={documentMimeTypes.join(",")} disabled={busy || Boolean(pendingId)}
        onChange={event => { setFile(event.target.files?.[0] ?? null); setMessage(""); setSuccess(false); }}
        className="block min-h-12 w-full min-w-0 rounded-md border p-2 text-sm file:mr-2 file:min-h-9 file:rounded-md file:border-0 file:bg-secondary file:px-3" aria-describedby="document-help" />
      <p id="document-help" className="text-xs text-muted-foreground">PDF, JPEG eller PNG. Max 15 MB per fil.</p>
    </div>
    {file && <p className="break-words text-sm">{sanitizeFileName(file.name)} · {file.type || "Okänd filtyp"} · {formatFileSize(file.size)}</p>}
    {message && <p role={success ? "status" : "alert"} className={success ? "text-sm" : "text-sm text-destructive"}>{message}</p>}
    {premiumRequired && <Link href="/account" className="inline-flex min-h-12 items-center text-sm underline">Se Premium och uppgradera</Link>}
    <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy} aria-busy={busy} className="min-h-12">{busy ? "Laddar upp…" : pendingId ? "Bekräfta igen" : "Ladda upp"}</Button>
      {pendingId && <Button type="button" variant="outline" disabled={busy} onClick={cancel} className="min-h-12">Avbryt uppladdning</Button>}
    </div>
  </form>;
}
