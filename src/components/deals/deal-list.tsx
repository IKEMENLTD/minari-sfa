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
        <p className="text-sm">案件がありません</p>
      </div>
    );
  }

  return (
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
                {deal.company.name}
              </Link>
            </TableCell>
            <TableCell>
              <PhaseBadge
                phaseName={deal.phase.phase_name}
                phaseOrder={deal.phase.phase_order}
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
            <TableCell>{deal.company.assigned_to || '-'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export { DealList };
