import Link from "next/link";
import { BookOpen } from "lucide-react";
import { AppContainer } from "@/components/layout/app-container";
import { DesktopSidebar } from "@/components/navigation/desktop-sidebar";
import { MobileBottomNav } from "@/components/navigation/mobile-bottom-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:p-4">Hoppa till innehållet</a>
      <DesktopSidebar />
      <div className="md:pl-64">
        <header className="border-b bg-card px-4 pt-[env(safe-area-inset-top)] md:hidden">
          <Link href="/dashboard" className="flex min-h-16 w-fit items-center gap-3 font-semibold">
            <BookOpen aria-hidden="true" className="size-5 text-primary" />Servicebok
          </Link>
        </header>
        <main id="main-content" tabIndex={-1} className="pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8">
          <AppContainer>{children}</AppContainer>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
