import { Skeleton } from "@/components/ui/skeleton";

export function LoadingSkeleton({ label = "Laddar innehåll" }: { label?: string }) {
  return (
    <div role="status" className="space-y-3 rounded-lg border p-4">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-3">
        <Skeleton className="h-5 w-1/3 motion-reduce:animate-none" />
        <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
        <Skeleton className="h-4 w-1/2 motion-reduce:animate-none" />
      </div>
    </div>
  );
}
