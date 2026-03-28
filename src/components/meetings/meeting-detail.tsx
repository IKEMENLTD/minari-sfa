'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronRight, RefreshCw, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import type { MeetingDetail as MeetingDetailType } from '@/types';
import type { BadgeVariant } from '@/components/ui/badge';

interface MeetingDetailProps {
  meeting: MeetingDetailType;
  onResummarize?: () => void;
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

function MeetingDetailView({ meeting, onResummarize }: MeetingDetailProps) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [resummarizing, setResummarizing] = useState(false);
  const [resummarizeMessage, setResummarizeMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const handleExportDoc = async () => {
    setExporting(true);
    setExportMessage(null);
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/export-doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const errJson: { error: string } = await res.json();
        throw new Error(errJson.error || '書き出しに失敗しました');
      }
      const json: { data: { docUrl: string; isNew: boolean } } = await res.json();
      setExportMessage(
        json.data.isNew
          ? 'Google Docsを新規作成しました'
          : 'Google Docsに追記しました'
      );
    } catch (e) {
      setExportMessage(e instanceof Error ? e.message : '書き出しに失敗しました');
    } finally {
      setExporting(false);
    }
  };

  const handleResummarize = async () => {
    setResummarizing(true);
    setResummarizeMessage(null);
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/resummarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const errJson: { error: string } = await res.json();
        throw new Error(errJson.error || '再生成に失敗しました');
      }
      setResummarizeMessage('要約を再生成しました。ページを再読み込みしてください。');
      if (onResummarize) onResummarize();
    } catch (e) {
      setResummarizeMessage(e instanceof Error ? e.message : '再生成に失敗しました');
    } finally {
      setResummarizing(false);
    }
  };

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
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-text">要約</h2>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportDoc}
                  loading={exporting}
                  disabled={exporting || resummarizing}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Google Docsに書き出す
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleResummarize}
                  loading={resummarizing}
                  disabled={resummarizing || exporting}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  再生成
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text whitespace-pre-wrap leading-relaxed">
              {meeting.summary.summary_text}
            </p>
            {(resummarizeMessage || exportMessage) && (
              <p className="mt-3 text-xs text-text-secondary">
                {resummarizeMessage}
                {resummarizeMessage && exportMessage && ' / '}
                {exportMessage}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 文字起こし全文（折りたたみ） */}
      {meeting.transcript && (
        <Card>
          <button
            onClick={() => setTranscriptOpen(!transcriptOpen)}
            aria-expanded={transcriptOpen}
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
