import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export default function DealDetailLoading() {
  return (
    <div className="space-y-6">
      {/* パンくず */}
      <div className="flex items-center gap-1">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-24" />
      </div>

      {/* 案件カード */}
      <div className="max-w-xl">
        <Card>
          <div className="border-b border-border px-5 py-4 flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="px-5 py-4 space-y-4">
            {/* 進捗バー */}
            <div>
              <div className="flex justify-between mb-1">
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>

            {/* ステータス要約 */}
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />

            {/* ネクストアクション */}
            <div>
              <Skeleton className="h-3 w-28 mb-1" />
              <Skeleton className="h-4 w-48" />
            </div>

            {/* 最終商談日 */}
            <div>
              <Skeleton className="h-3 w-20 mb-1" />
              <Skeleton className="h-4 w-24" />
            </div>

            <Skeleton className="h-4 w-28" />
          </div>
        </Card>
      </div>
    </div>
  );
}
