"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startTransfer, cancelTransfer } from "@/app/(app)/vehicles/[vehicleId]/transfer/actions";
import type { TransferState } from "@/lib/validation/transfer";

type Summary = { id: string; status: string; expires_at: string } | null;
const formatDate = (date: string) => new Intl.DateTimeFormat("sv-SE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Stockholm" }).format(new Date(date));

function CancelForm({ vehicleId, transferId }: { vehicleId: string; transferId: string }) {
  const [state, action, pending] = useActionState<TransferState, FormData>(cancelTransfer.bind(null, vehicleId, transferId), {});
  return <form action={action} className="mt-6 space-y-4">
    <label className="flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" name="confirm" value="yes" required className="size-5 shrink-0" />Jag vill avbryta överföringen och göra länken ogiltig.</label>
    {state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
    <Button type="submit" variant="outline" disabled={pending} className="min-h-12 w-full">{pending ? "Avbryter…" : "Avbryt överföring"}</Button>
  </form>;
}

export function SellerTransferForm({ vehicleId, transfer, documents }: { vehicleId: string; transfer: Summary; documents: { id: string; file_name: string }[] }) {
  const [state, action, pending] = useActionState<TransferState, FormData>(startTransfer.bind(null, vehicleId), {});
  const [selectDocuments, setSelectDocuments] = useState(false);
  const [review, setReview] = useState(false);
  const [copied, setCopied] = useState("");
  // URL stays in this component's memory only. A reload cannot recover it.
  const active = transfer?.status === "pending";
  if (active) return <section className="space-y-4">
    <h2 className="text-xl font-semibold">Överföring väntar</h2>
    <p>Giltig till {formatDate(transfer.expires_at)}.</p>
    {state.url ? <>
      <label htmlFor="transfer-link" className="block text-sm font-medium">Överföringslänk</label>
      <Input id="transfer-link" value={state.url} readOnly className="min-h-12" onFocus={(event) => event.target.select()} />
      <Button className="min-h-12 w-full" onClick={async () => {
        try { await navigator.clipboard.writeText(state.url!); setCopied("Länken är kopierad."); }
        catch { setCopied("Markera länken och kopiera den manuellt."); }
      }}>Kopiera länk</Button>
      {copied && <p role="status">{copied}</p>}
      <p className="text-sm text-muted-foreground">Dela länken endast med mottagaren. Den visas bara här tills du lämnar sidan.</p>
    </> : <p className="text-sm text-muted-foreground">Länken kan inte visas igen. Om du saknar den behöver du avbryta och skapa en ny överföring.</p>}
    <CancelForm vehicleId={vehicleId} transferId={transfer.id} />
  </section>;
  return <form action={action} className="space-y-6">
    {state.url && <p role="status">Överföringen är inte längre aktiv.</p>}
    {transfer?.status === "expired" && <p role="status">Den tidigare länken har gått ut. Du kan skapa en ny.</p>}
    <p className="rounded-lg border border-destructive/40 p-4 text-sm leading-6">När den nya ägaren accepterar överföringen förlorar du åtkomsten till fordonet.</p>
    <p className="text-sm leading-6">Servicehistoriken och serviceplanen följer fordonet. Privata dokument överförs endast om du väljer dem. Personliga påminnelser följer inte med.</p>
    {!review ? <>
      <fieldset className="space-y-3"><legend className="mb-2 font-medium">Privata dokument</legend>
        <label className="flex min-h-12 items-center gap-3 text-sm"><input type="radio" name="selection-mode" checked={!selectDocuments} onChange={() => setSelectDocuments(false)} className="size-5 shrink-0" />Inga privata dokument överförs</label>
        <label className="flex min-h-12 items-center gap-3 text-sm"><input type="radio" name="selection-mode" checked={selectDocuments} onChange={() => setSelectDocuments(true)} className="size-5 shrink-0" />Välj dokument som får överföras</label>
      </fieldset>
    </> : <h2 className="text-lg font-semibold">Bekräfta överföring</h2>}
    {selectDocuments && <fieldset className="space-y-2"><legend className="mb-2 text-sm">Välj högst 100 dokument. Kontrollera personuppgifterna innan du delar.</legend>
      {documents.length === 0 && <p className="text-sm text-muted-foreground">Inga dokument att välja.</p>}
      {documents.map((doc) => <label key={doc.id} className="flex min-h-12 items-center gap-3 rounded-md border p-3 text-sm"><input type="checkbox" name="document" value={doc.id} className="size-5 shrink-0" /><span className="min-w-0 break-all">{doc.file_name}</span></label>)}
    </fieldset>}
    {review ? <>
      <label className="flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" name="confirm" value="yes" required className="size-5 shrink-0" />Jag förstår att jag förlorar åtkomsten och vill skapa överföringslänken.</label>
      {state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
      <Button type="submit" disabled={pending} aria-busy={pending} className="min-h-12 w-full">{pending ? "Skapar länk…" : "Skapa överföringslänk"}</Button>
      <Button type="button" variant="outline" className="min-h-12 w-full" disabled={pending} onClick={() => setReview(false)}>Tillbaka till dokumentval</Button>
    </> : <Button type="button" className="min-h-12 w-full" onClick={() => setReview(true)}>Fortsätt till bekräftelse</Button>}
  </form>;
}
