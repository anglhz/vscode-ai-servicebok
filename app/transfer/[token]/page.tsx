import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { RegistrationNumber } from "@/components/vehicles/registration-number";
import { AcceptTransferForm } from "@/components/vehicle-transfers/accept-form";
import { getCurrentUser } from "@/lib/auth/session";
import { transferTokenSchema } from "@/lib/validation/transfer";
import { previewVehicleTransfer } from "@/services/vehicle-transfers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ta över fordon", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function RecipientPage({ params }: { params: Promise<{ token: string }> }) {
  const parsed = transferTokenSchema.safeParse((await params).token);
  const user = await getCurrentUser();
  let content;
  if (!parsed.success) content = <p>Länken är ogiltig. Be säljaren om en ny överföringslänk.</p>;
  else if (!user) content = <>
    <p className="text-sm leading-6">Logga in eller skapa konto för att se fordonet och acceptera överföringen. Fordonets privata historik visas först när du har tagit över det.</p>
    <a href={`/transfer/${parsed.data}/continue`} rel="noreferrer" className="flex min-h-12 items-center justify-center rounded-md bg-primary px-4 text-sm text-primary-foreground">Logga in och fortsätt</a>
    <a href={`/transfer/${parsed.data}/continue?mode=signup`} rel="noreferrer" className="flex min-h-12 items-center justify-center rounded-md border px-4 text-sm">Skapa konto och fortsätt</a>
  </>;
  else {
    let preview;
    try { preview = await previewVehicleTransfer(parsed.data); }
    catch { return <main className="mx-auto max-w-xl px-4 py-8"><PageHeader title="Överföringen kunde inte hämtas" /><p>Försök ladda om sidan om en stund.</p></main>; }
    if (!preview || preview.status !== "pending") content = <p role="status">{preview?.status === "expired" ? "Länken har gått ut." : preview?.status === "cancelled" ? "Överföringen har avbrutits." : preview?.status === "accepted" ? "Överföringen har redan accepterats." : "Länken är ogiltig."} Be säljaren om en ny länk om det behövs.</p>;
    else content = <>
      <h2 className="text-xl font-semibold">{preview.make} {preview.model}</h2>
      <RegistrationNumber value={preview.registration_number} />
      <p className="text-sm leading-6">Servicehistorik, miltalshistorik och serviceplan följer fordonet. Kopplade servicepåminnelser förs över till ditt konto. Säljaren förlorar åtkomsten när du accepterar.</p>
      <p className="text-sm">{preview.document_count} privata dokument har valts för överföring. Innehållet blir tillgängligt efter att du accepterat.</p>
      <p className="text-sm text-muted-foreground">Giltig till {new Intl.DateTimeFormat("sv-SE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Stockholm" }).format(new Date(preview.expires_at))}.</p>
      {preview.is_sender ? <p role="status">Du kan inte acceptera din egen överföring. Dela länken med mottagaren.</p> : <AcceptTransferForm token={parsed.data} />}
    </>;
  }
  return <main className="mx-auto min-h-dvh w-full max-w-xl px-4 py-8"><PageHeader title="Ta över fordon" /><section className="space-y-6">{content}</section><Link href={user ? "/vehicles" : "/login"} className="mt-6 inline-flex min-h-12 items-center text-primary underline">{user ? "Mina fordon" : "Till inloggningen"}</Link></main>;
}
