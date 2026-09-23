"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { upgradeAccount, manageSubscription } from "@/app/(app)/account/actions";

export function BillingButton({ manage = false }: { manage?: boolean }) {
  const [plan, setPlan] = useState("monthly");
  const [state, action, pending] = useActionState(manage ? manageSubscription : upgradeAccount, { message: "" });
  return <form action={action} onReset={(event) => event.preventDefault()} className="space-y-2">
    {!manage && <fieldset disabled={pending} className="space-y-2">
      <legend className="mb-2 text-sm font-medium">Välj betalningsintervall</legend>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm">
        <input type="radio" name="plan" value="monthly" checked={plan === "monthly"} onChange={() => setPlan("monthly")} className="size-4" />
        Premium månadsvis · 39 kr/mån
      </label>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm">
        <input type="radio" name="plan" value="yearly" checked={plan === "yearly"} onChange={() => setPlan("yearly")} className="size-4" />
        Premium årsvis · 349 kr/år
      </label>
    </fieldset>}
    <Button type="submit" variant={manage ? "outline" : "default"} disabled={pending} aria-busy={pending} className="min-h-12 w-full sm:w-auto">
      {pending ? "Öppnar…" : manage ? "Hantera abonnemang" : "Uppgradera till Premium"}
    </Button>
    {state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
  </form>;
}
