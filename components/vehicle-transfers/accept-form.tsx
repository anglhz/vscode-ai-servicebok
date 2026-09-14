"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { acceptTransfer } from "@/app/transfer/[token]/actions";
import type { TransferState } from "@/lib/validation/transfer";

export function AcceptTransferForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<TransferState, FormData>(acceptTransfer.bind(null, token), {});
  return <form action={action} className="space-y-4">
    <label className="flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" name="confirm" value="yes" required className="size-5 shrink-0" />Jag vill ta över fordonet och dess servicebok.</label>
    {state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
    <Button type="submit" disabled={pending} aria-busy={pending} className="min-h-12 w-full">{pending ? "Överför…" : "Acceptera fordon"}</Button>
  </form>;
}
