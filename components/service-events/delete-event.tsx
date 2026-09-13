"use client";

import { useActionState, useState } from "react";
import { removeEvent } from "@/app/(app)/vehicles/[vehicleId]/events/actions";
import { Button } from "@/components/ui/button";
import type { ServiceEventFormState } from "@/lib/validation/service-event";

export function DeleteEvent({ vehicleId, eventId }: { vehicleId: string; eventId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<ServiceEventFormState, FormData>(removeEvent.bind(null, vehicleId, eventId), {});
  return confirming ? <form action={action} className="w-full space-y-4 rounded-lg border p-4">
    <p className="font-medium">Ta bort händelsen?</p>
    <p className="text-sm text-muted-foreground">Händelsen försvinner från historiken. Fordonets aktuella miltal kan ändras.</p>
    <input type="hidden" name="confirm" value="yes" />
    {state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
    <div className="flex flex-wrap gap-3">
      <Button type="submit" variant="destructive" disabled={pending} aria-busy={pending} className="min-h-12">{pending ? "Tar bort…" : "Ja, ta bort händelsen"}</Button>
      <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(false)} className="min-h-12">Avbryt</Button>
    </div>
  </form> : <Button type="button" variant="outline" onClick={() => setConfirming(true)} className="min-h-12">Ta bort</Button>;
}
