'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import type { MeetingDetail as MeetingDetailType } from '@/types';
import type { BadgeVariant } from '@/components/ui/badge';

interface MeetingDetailProps {
  meeting: MeetingDetailType;
}

const statusLabel: Record<string, string> = {
  pending: '承認待ち',
  approved: '承認済み',
  rejected: '却下',
};

const statusVariant: Record<string, BadgeVariant> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

function MeetingDetailView({ meeting }: MeetingDetailProps) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* メタ情報 */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-text">議事録情報</h2>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-text-secondary">日付</dt>
              <dd className="mt-1 text-sm text-text">
                {format(new Date(meeting.meeting_date), 'yyyy/MM/dd')}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-text-secondary">企業名</dt>
              <dd className="mt-1 text-sm text-text">
                {meeting.company?.name || meeting.ai_estimated_company || '-'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-text-secondary">参加者</dt>
              <dd className="mt-1 text-sm text-text">
                {meeting.participants.join(', ')}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-text-secondary">ソース</dt>
              <dd className="mt-1">
                <Badge variant="info">{meeting.source}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-text-secondary">ステータス</dt>
              <dd className="mt-1">
                <Badge variant={statusVariant[meeting.approval_status] || 'default'}>
                  {statusLabel[meeting.approval_status] || meeting.approval_status}
                </Badge>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* 要約 */}
      {meeting.summary && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-text">要約</h2>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text whitespace-pre-wrap leading-relaxed">
              {meeting.summary.summary_text}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 文字起こし全文（折りたたみ） */}
      {meeting.transcript && (
        <Card>
          <button
            onClick={() => setTranscriptOpen(!transcriptOpen)}
            className="flex w-full items-center gap-2 px-5 py-4 text-left"
          >
            {transcriptOpen ? (
              <ChevronDown className="h-4 w-4 text-text-secondary" />
            ) : (
              <ChevronRight className="h-4 w-4 text-text-secondary" />
            )}
            <h2 className="text-base font-semibold text-text">
              文字起こし全文
            </h2>
          </button>
          {transcriptOpen && (
            <CardContent className="border-t border-border">
              <p className="text-sm text-text whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                {meeting.transcript.full_text}
              </p>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

export { MeetingDetailView };
