import { cn } from "@/lib/cn";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-hf-border/60",
        className,
      )}
      {...props}
    />
  );
}

export function PanelSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div
      className="flex h-full flex-col gap-3 p-4"
      role="status"
      aria-live="polite"
      aria-label={label}
      data-testid="panel-skeleton"
    >
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
