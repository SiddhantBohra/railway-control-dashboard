import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

export function WorkloadSkeleton() {
  return (
    <Card className="resource-panel" aria-hidden="true">
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-48 max-w-full" />
        </div>
      </div>
      <div className="resource-state-grid">
        {[0, 1, 2].map((key) => (
          <div key={key} className="space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-36" />
      </div>
      <Skeleton className="mt-6 h-3 w-3/4" />
    </Card>
  );
}

export function OperationSkeleton() {
  return (
    <Card className="operation-panel" role="status" aria-label="Loading request timeline">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-4 h-5 w-36" />
      <Skeleton className="mt-5 h-1.5 w-full" />
      <div className="space-y-5 py-6">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="flex items-center gap-3">
            <Skeleton className="size-7 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-2 w-4/5" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading request timeline…</span>
    </Card>
  );
}

export function ActivitySkeleton() {
  return (
    <Card className="history-panel" role="status" aria-label="Loading activity">
      <div className="section-heading">
        <Skeleton className="h-5 w-24" />
        <Spinner className="text-muted-foreground" />
      </div>
      <div className="divide-y border-t">
        {[0, 1, 2].map((key) => (
          <div key={key} className="flex items-center justify-between gap-6 px-6 py-5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="hidden h-3 w-28 sm:block" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading activity…</span>
    </Card>
  );
}

export function DashboardSkeleton({ label = 'Loading your workload…' }: { label?: string }) {
  return (
    <div className="dashboard" role="status" aria-label={label} aria-busy="true">
      <div className="loading-caption">
        <Spinner />
        {label}
      </div>
      <div className="control-grid">
        <WorkloadSkeleton />
        <OperationSkeleton />
      </div>
      <ActivitySkeleton />
    </div>
  );
}
