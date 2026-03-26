import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export default function MeetingDetailLoading() {
  return (
    <div className="space-y-6">
      {/* パンくず */}
      <div className="flex items-center gap-1">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-24" />
      </div>

      {/* 議事録情報カード */}
      <Card>
        <div className="border-b border-border px-5 py-4">
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="px-5 py-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </Card>

      {/* 要約カード */}
      <Card>
        <div className="border-b border-border px-5 py-4">
          <Skeleton className="h-5 w-12" />
        </div>
        <div className="px-5 py-4 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </Card>
    </div>
  );
}
