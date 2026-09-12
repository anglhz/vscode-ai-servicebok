import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export function AppContainer({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8", className)} {...props} />;
}
