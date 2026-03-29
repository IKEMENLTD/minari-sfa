import Link from 'next/link';
import { format } from 'date-fns';
import { FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeader,
} from '@/components/ui/table';
import type { MeetingRow } from '@/types';
import type { BadgeVariant } from '@/components/ui/badge';

interface MeetingListProps {
  meetings: MeetingRow[];
}

const statusLabel: Record<MeetingRow['approval_status'], string> = {
  pending: '承認待ち',
  approved: '承認済み',
  rejected: '却下',
};

const statusVariant: Record<MeetingRow['approval_status'], BadgeVariant> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

function MeetingList({ meetings }: MeetingListProps) {
  if (meetings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
        <FileText className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">まだ議事録がありません。音声や文字起こしデータを取り込んで議事録を登録してください。</p>
      </div>
    );
  }

  return (
    <>
      {/* モバイル: カード表示 */}
      <div className="sm:hidden space-y-3">
        {meetings.map((meeting) => (
          <Link
            key={meeting.id}
            href={`/meetings/${meeting.id}`}
            className="block border border-border bg-surface p-3 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-accent">
                {format(new Date(meeting.meeting_date), 'yyyy/MM/dd')}
              </span>
              <div className="flex items-center gap-1.5">
                <Badge variant="info">{meeting.source}</Badge>
                <Badge variant={statusVariant[meeting.approval_status]}>
                  {statusLabel[meeting.approval_status]}
                </Badge>
              </div>
            </div>
            <p className="text-sm font-medium text-text mb-1">
              {meeting.ai_estimated_company || '(企業名不明)'}
            </p>
            <p className="text-xs text-text-secondary truncate">
              {meeting.participants.join(', ')}
            </p>
          </Link>
        ))}
      </div>

      {/* デスクトップ: テーブル表示 */}
      <div className="hidden sm:block">
        <Table>
          <TableHead>
            <tr>
              <TableHeader>日付</TableHeader>
              <TableHeader>企業名（推定）</TableHeader>
              <TableHeader>参加者</TableHeader>
              <TableHeader>ソース</TableHeader>
              <TableHeader>ステータス</TableHeader>
            </tr>
          </TableHead>
          <TableBody>
            {meetings.map((meeting) => (
              <TableRow key={meeting.id}>
                <TableCell>
                  <Link
                    href={`/meetings/${meeting.id}`}
                    className="text-accent hover:underline"
                  >
                    {format(new Date(meeting.meeting_date), 'yyyy/MM/dd')}
                  </Link>
                </TableCell>
                <TableCell>
                  {meeting.ai_estimated_company || '-'}
                </TableCell>
                <TableCell>
                  <span className="truncate max-w-[200px] inline-block">
                    {meeting.participants.join(', ')}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="info">{meeting.source}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant[meeting.approval_status]}>
                    {statusLabel[meeting.approval_status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export { MeetingList };
