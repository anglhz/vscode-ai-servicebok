import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/auth/session";
import { getOwnProfile } from "@/services/profiles/get-profile";
import { LogoutButton } from "@/components/auth/logout-button";
import { BillingSummary } from "@/components/subscriptions/billing-summary";

export const metadata: Metadata = { title: "Konto" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const user = await requireUser();
  const { profile, unavailable } = await getOwnProfile();
  return <>
    <PageHeader title="Konto" description="Dina uppgifter och inställningar." />
    <section className="max-w-lg space-y-6 rounded-xl border bg-card p-6">
      <dl className="space-y-4">
        <div><dt className="text-sm text-muted-foreground">E-post</dt><dd className="mt-1 break-all font-medium">{user.email}</dd></div>
        {profile?.display_name && <div><dt className="text-sm text-muted-foreground">Namn</dt><dd className="mt-1 break-words font-medium">{profile.display_name}</dd></div>}
      </dl>
      {unavailable && <p role="status" className="text-sm text-muted-foreground">Profiluppgifterna kunde inte hämtas just nu.</p>}
      <LogoutButton />
    </section>
    <BillingSummary checkout={(await searchParams).checkout} />
  </>;
}
