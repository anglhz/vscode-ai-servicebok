import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ApplicationLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <AppShell>{children}</AppShell>;
}
