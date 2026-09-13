import type { ReactNode } from "react";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-2">
        <h1 className="break-words text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="max-w-xl break-words text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {action}
    </header>
  );
}
