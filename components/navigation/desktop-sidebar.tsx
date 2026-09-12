import Link from "next/link";
import { BookOpen } from "lucide-react";
import { NavLinks } from "@/components/navigation/nav-links";

export function DesktopSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r bg-card p-6 md:flex">
      <Link href="/dashboard" className="mb-8 flex min-h-12 items-center gap-3 text-lg font-semibold">
        <BookOpen aria-hidden="true" className="size-6 text-primary" />Servicebok
      </Link>
      <nav aria-label="Huvudnavigation" className="flex flex-col gap-2"><NavLinks /></nav>
      <p className="mt-auto pt-8 text-xs leading-5 text-muted-foreground">Ditt fordons historia.<br />Samlad på ett ställe.</p>
    </aside>
  );
}
