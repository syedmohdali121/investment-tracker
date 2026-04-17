import { cn } from "@/lib/cn";

/**
 * Base shimmering block. Use for text-sized and larger placeholders.
 * Shimmer animation is defined in globals.css as @keyframes shimmer.
 */
export function Skeleton({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-white/[0.04]",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite]",
        "before:bg-gradient-to-r before:from-transparent before:via-white/[0.07] before:to-transparent",
        className,
      )}
      {...rest}
    />
  );
}

/** Dashboard KPI-style card skeleton. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.02] p-5",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-4 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-9 w-40" />
      <Skeleton className="mt-2 h-3 w-28" />
    </div>
  );
}

/** Chart / pane skeleton with a title + rectangle area. */
export function PaneSkeleton({
  className,
  height = "h-64",
}: {
  className?: string;
  height?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.02] p-5",
        className,
      )}
    >
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-1 h-3 w-56" />
      <Skeleton className={cn("mt-4 w-full rounded-xl", height)} />
    </div>
  );
}

/** Multi-row list skeleton, e.g. for holdings table. */
export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="divide-y divide-white/5">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-7 w-7 rounded-md" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
