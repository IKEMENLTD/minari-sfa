import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { PhaseBadge } from '@/components/deals/phase-badge';
import type { DealWithDetails, SalesPhaseRow } from '@/types';

interface DealCardProps {
  deal: DealWithDetails;
  allPhases: SalesPhaseRow[];
}

function DealCard({ deal, allPhases }: DealCardProps) {
  const totalPhases = allPhases.length || 5;
  const currentOrder = deal.phase.phase_order;
  const progressPercent = Math.round((currentOrder / totalPhases) * 100);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text">{deal.company.name}</h3>
          <PhaseBadge
            phaseName={deal.phase.phase_name}
            phaseOrder={deal.phase.phase_order}
            totalPhases={totalPhases}
          />
        </div>
      </CardHeader>
      <CardContent>
        {/* フェーズ進捗バー */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
            <span>進捗</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-accent transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* ステータス要約 */}
        {deal.deal_status.status_summary && (
          <p className="text-sm text-text mb-3">
            {deal.deal_status.status_summary}
          </p>
        )}

        {/* ネクストアクション */}
        {deal.deal_status.next_action && (
          <div className="mb-3">
            <p className="text-xs font-medium text-text-secondary mb-0.5">
              ネクストアクション
            </p>
            <p className="text-sm text-text">{deal.deal_status.next_action}</p>
          </div>
        )}

        {/* 最終商談日 */}
        {deal.deal_status.last_meeting_date && (
          <div className="mb-3">
            <p className="text-xs font-medium text-text-secondary mb-0.5">
              最終商談日
            </p>
            <p className="text-sm text-text">
              {new Date(deal.deal_status.last_meeting_date).toLocaleDateString('ja-JP')}
            </p>
          </div>
        )}

        {/* 議事録リンク */}
        <Link
          href={`/meetings?company=${deal.company.id}`}
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          関連議事録を見る
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}

export { DealCard };
