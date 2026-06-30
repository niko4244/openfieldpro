import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div>
      {/* ── Header skeleton ── */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 mb-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-5 rounded" />
            </div>
            <Skeleton className="h-8 w-24 mb-1" />
            <Skeleton className="h-3 w-28" />
          </Card>
        ))}
      </div>

      {/* ── Two-column grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-5 w-20 rounded" />
                <Skeleton className="flex-1 h-2 rounded-full" />
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-12" />
          </div>
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-2 w-2 rounded-full mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <Skeleton className="h-3 w-full mb-1" />
                  <Skeleton className="h-2 w-24" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Bottom full-width card skeleton ── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="flex-1 h-3" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
