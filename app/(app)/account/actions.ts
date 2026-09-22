"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { startCheckout, startPortal } from "@/services/subscriptions/checkout";

export async function upgradeAccount() {
  await requireUser();
  let url: string;
  try { url = await startCheckout(); }
  catch { return { message: "Betalningen kunde inte startas. Försök igen." }; }
  redirect(url);
}
export async function manageSubscription() {
  await requireUser();
  let url: string;
  try { url = await startPortal(); }
  catch { return { message: "Abonnemanget kunde inte öppnas. Om du inte har påbörjat en betalning, välj Uppgradera till Premium först." }; }
  redirect(url);
}
