"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { upgradeAccount, manageSubscription } from "@/app/(app)/account/actions";

export function BillingButton({ manage = false }: { manage?: boolean }) {
  const [state, action, pending] = useActionState(manage ? manageSubscription : upgradeAccount, { message: "" });
  return <form action={action} className="space-y-2">
    <Button type="submit" variant={manage ? "outline" : "default"} disabled={pending} aria-busy={pending} className="min-h-12 w-full sm:w-auto">
      {pending ? "Öppnar…" : manage ? "Hantera abonnemang" : "Uppgradera till Premium"}
    </Button>
    {state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
  </form>;
}
