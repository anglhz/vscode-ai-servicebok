"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { deactivateInterval } from "@/app/(app)/vehicles/[vehicleId]/service/actions";

export function IntervalActions({ vehicleId, intervalId }: { vehicleId: string; intervalId: string }) {
  const [confirm, setConfirm] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState("");
  const router = useRouter(); const base = `/vehicles/${vehicleId}/service`;
  async function deactivate() {
    setPending(true); setError("");
    try { const result = await deactivateInterval(vehicleId, intervalId, true); if (result.message) setError(result.message); else router.refresh(); }
    catch { setError("Intervallet kunde inte avaktiveras. Försök igen."); }
    finally { setPending(false); }
  }
  return <div className="space-y-3">
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Button asChild className="min-h-12"><Link href={`${base}?complete=${intervalId}`}>Markera som utfört</Link></Button>
      <Button asChild variant="outline" className="min-h-12"><Link href={`${base}?edit=${intervalId}`}>Redigera</Link></Button>
      {!confirm && <Button variant="ghost" className="min-h-12" onClick={() => setConfirm(true)}>Avaktivera</Button>}
    </div>
    {confirm && <div className="space-y-2"><p className="text-sm">Avaktivera intervallet och dess påminnelse?</p>
      <div className="flex flex-wrap gap-2"><Button disabled={pending} aria-busy={pending} variant="destructive" className="min-h-12" onClick={deactivate}>{pending ? "Sparar…" : "Ja, avaktivera"}</Button>
        <Button disabled={pending} variant="outline" className="min-h-12" onClick={() => setConfirm(false)}>Avbryt</Button></div></div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
