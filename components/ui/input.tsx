import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn("flex h-12 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 aria-invalid:border-destructive", className)} {...props} />;
}
