"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/components/navigation/nav-items";
import { cn } from "@/lib/utils/cn";

export function NavLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return navItems.map(({ href, label, icon: Icon }) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    const primary = href === "/new";
    return (
      <Link key={href} href={href} aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-12 min-w-0 items-center gap-3 rounded-lg text-sm font-medium transition-colors motion-reduce:transition-none",
          mobile ? "flex-col justify-center gap-1 px-1 py-2 text-xs" : "px-4 py-3",
          active ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          primary && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
          primary && active && "ring-2 ring-primary ring-offset-2 ring-offset-card",
        )}>
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        <span>{label}</span>
      </Link>
    );
  });
}
