"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { openDocument, removeDocument } from "@/app/(app)/vehicles/[vehicleId]/documents/actions";

export function DocumentActions({ vehicleId, documentId }: { vehicleId: string; documentId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function open() {
    setBusy(true); setError("");
    try {
      const result = await openDocument(vehicleId, documentId);
      if (result.url) window.location.assign(result.url);
      else setError(result.error ?? "Dokumentet kunde inte öppnas.");
    } catch { setError("Dokumentet kunde inte öppnas. Försök igen."); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError("");
    try {
      const result = await removeDocument(vehicleId, documentId, true);
      if (result.error) setError(result.error); else { setConfirm(false); router.refresh(); }
    } catch { setError("Dokumentet kunde inte tas bort. Försök igen."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3">
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {confirm ? <><p className="text-sm">Ta bort dokumentet? Filen tas bort och kan inte återställas här.</p>
      <div className="flex flex-wrap gap-3"><Button variant="destructive" disabled={busy} onClick={remove} className="min-h-12">{busy ? "Tar bort…" : "Ja, ta bort"}</Button>
        <Button variant="outline" disabled={busy} onClick={() => setConfirm(false)} className="min-h-12">Avbryt</Button></div></> :
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={open} className="min-h-12">{busy ? "Öppnar…" : "Öppna"}</Button>
        <Button variant="outline" disabled={busy} onClick={() => setConfirm(true)} className="min-h-12">Ta bort</Button></div>}
  </div>;
}
