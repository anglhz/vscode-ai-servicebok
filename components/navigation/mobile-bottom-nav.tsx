import { NavLinks } from "@/components/navigation/nav-links";

export function MobileBottomNav() {
  return (
    <nav aria-label="Huvudnavigation" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-[1fr_1fr_1fr_1.4fr_1fr] gap-1 px-2 py-2"><NavLinks mobile /></div>
    </nav>
  );
}
