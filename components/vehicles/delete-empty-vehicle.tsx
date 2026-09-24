"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { deleteMisregisteredVehicle } from "@/app/(app)/vehicles/[vehicleId]/actions";

export function DeleteEmptyVehicle({ vehicleId, vehicleName }: { vehicleId: string; vehicleName: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState(deleteMisregisteredVehicle.bind(null, vehicleId), {});
  return <section className="mt-8 space-y-3 border-t pt-6" aria-label="Felregistrerat fordon">
    <p className="text-sm text-muted-foreground">Detta går bara om fordonet saknar historik, dokument och tidigare ägarbyten.</p>
    <Button type="button" variant="outline" className="min-h-12 whitespace-normal text-destructive" onClick={() => dialog.current?.showModal()}>
      Ta bort felregistrerat fordon
    </Button>
    <dialog ref={dialog} aria-labelledby="delete-vehicle-title" aria-describedby="delete-vehicle-description"
      onCancel={event => { if (pending) event.preventDefault(); }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg border bg-background p-6 text-foreground shadow-lg backdrop:bg-black/50">
      <h2 id="delete-vehicle-title" className="text-lg font-semibold">Ta bort felregistrerat fordon?</h2>
      <p id="delete-vehicle-description" className="my-4 break-words text-sm">Du tar bort {vehicleName}. Åtgärden kan inte ångras. Fordonet måste sakna historik, dokument och tidigare ägarbyten.</p>
      {state.message && <p role="alert" className="mb-4 text-sm text-destructive">{state.message}</p>}
      <form action={action} className="flex flex-col gap-3 sm:flex-row">
        <Button autoFocus type="button" variant="outline" className="min-h-12" disabled={pending} onClick={() => dialog.current?.close()}>Avbryt</Button>
        <Button type="submit" name="confirm" value="delete" variant="destructive" className="min-h-12" disabled={pending}>
          {pending ? "Tar bort…" : "Ta bort fordonet"}
        </Button>
      </form>
    </dialog>
  </section>;
}
