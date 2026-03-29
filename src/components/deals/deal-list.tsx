import Link from 'next/link';
import { Briefcase } from 'lucide-react';
import { PhaseBadge } from '@/components/deals/phase-badge';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeader,
} from '@/components/ui/table';
import type { DealWithDetails } from '@/types';

interface DealListProps {
  deals: DealWithDetails[];
}

function DealList({ deals }: DealListProps) {
  if (deals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
        <Briefcase className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">まだ案件がありません。議事録を取り込んで承認すると自動で登録されます。</p>
      </div>
    );
  }

  return (
    <>
      {/* モバイル: カード表示 */}
      <div className="sm:hidden space-y-3">
        {deals.map((deal) => (
          <Link
            key={deal.deal_status.id}
            href={`/deals/${deal.deal_status.id}`}
            className="block border border-border bg-surface p-3 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-accent">
                {deal.company?.name ?? '未登録'}
              </span>
              <PhaseBadge
                phaseName={deal.phase?.phase_name ?? '未設定'}
                phaseOrder={deal.phase?.phase_order ?? 0}
              />
            </div>
            {deal.deal_status.next_action && (
              <p className="text-xs text-text mb-1 line-clamp-2">
                {deal.deal_status.next_action}
              </p>
            )}
            <div className="flex items-center justify-between text-xs text-text-secondary">
              <span>
                {deal.deal_status.last_meeting_date
                  ? new Date(deal.deal_status.last_meeting_date).toLocaleDateString('ja-JP')
                  : '-'}
              </span>
              <span>{deal.company?.assigned_to || '-'}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* デスクトップ: テーブル表示 */}
      <div className="hidden sm:block">
        <Table>
          <TableHead>
            <tr>
              <TableHeader>企業名</TableHeader>
              <TableHeader>フェーズ</TableHeader>
              <TableHeader>ネクストアクション</TableHeader>
              <TableHeader>最終商談日</TableHeader>
              <TableHeader>担当者</TableHeader>
            </tr>
          </TableHead>
          <TableBody>
            {deals.map((deal) => (
              <TableRow key={deal.deal_status.id}>
                <TableCell>
                  <Link
                    href={`/deals/${deal.deal_status.id}`}
                    className="text-accent hover:underline font-medium"
                  >
                    {deal.company?.name ?? '未登録'}
                  </Link>
                </TableCell>
                <TableCell>
                  <PhaseBadge
                    phaseName={deal.phase?.phase_name ?? '未設定'}
                    phaseOrder={deal.phase?.phase_order ?? 0}
                  />
                </TableCell>
                <TableCell>
                  <span className="truncate max-w-[200px] inline-block">
                    {deal.deal_status.next_action || '-'}
                  </span>
                </TableCell>
                <TableCell>
                  {deal.deal_status.last_meeting_date
                    ? new Date(deal.deal_status.last_meeting_date).toLocaleDateString('ja-JP')
                    : '-'}
                </TableCell>
                <TableCell>{deal.company?.assigned_to || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export { DealList };
