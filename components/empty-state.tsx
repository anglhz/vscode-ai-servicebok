import type { ReactNode } from "react";

export function EmptyState({ title, description, icon, action }: { title: string; description: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      {icon && <div aria-hidden="true" className="mb-4 flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon}</div>}
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </section>
  );
}
