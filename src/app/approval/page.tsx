'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, AlertCircle, RefreshCw, X } from 'lucide-react';
import { ApprovalCard } from '@/components/meetings/approval-card';
import { SkeletonCard } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { MeetingRow, CompanyRow } from '@/types';

interface ProcessResult {
  processedCount: number;
  results: Array<{
    sourceId: string;
    source: 'jamroll' | 'proud';
    title: string;
    meetingId: string;
    estimatedCompany: string;
    isInternal: boolean;
  }>;
  errors: string[];
}

export default function ApprovalPage() {
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processMessage, setProcessMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meetingsRes, companiesRes] = await Promise.all([
        fetch('/api/meetings?approval_status=pending'),
        fetch('/api/companies'),
      ]);
      if (!meetingsRes.ok || !companiesRes.ok) {
        throw new Error('データの取得に失敗しました');
      }
      const meetingsJson: { data: MeetingRow[] } = await meetingsRes.json();
      const companiesJson: { data: CompanyRow[] } = await companiesRes.json();
      setMeetings(meetingsJson.data);
      setCompanies(companiesJson.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleProcess = async () => {
    setProcessing(true);
    setProcessMessage('議事録を取り込み中...');
    setError(null);
    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const errorJson: { error: string } = await res.json();
        throw new Error(errorJson.error || '議事録の取り込みに失敗しました');
      }
      const json: { data: ProcessResult } = await res.json();
      const result = json.data;

      let message =
        result.processedCount > 0
          ? `${result.processedCount}件の議事録を取り込みました`
          : '新しい議事録はありませんでした';

      if (result.errors.length > 0) {
        message += `（${result.errors.length}件エラー）`;
      }

      setProcessMessage(message);
      // 取り込み後にpending一覧をリロード
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : '議事録の取り込みに失敗しました');
      setProcessMessage(null);
    } finally {
      setProcessing(false);
    }
  };

  const handleApprove = async (
    meetingId: string,
    isCorrect: boolean,
    correctedCompany?: string,
    correctionNote?: string,
  ) => {
    setProcessMessage(null);
    const res = await fetch('/api/approval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetingId,
        isCorrect,
        correctedCompany,
        correctionNote,
      }),
    });
    if (!res.ok) {
      const errorJson: { error: string } = await res.json();
      throw new Error(errorJson.error || '承認処理に失敗しました');
    }
    // 承認後にcompaniesをリフレッシュ（新規企業が登録された可能性）
    setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
    await fetchData();
  };

  const handleReject = async (meetingId: string) => {
    setProcessMessage(null);
    const res = await fetch('/api/approval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetingId,
        isCorrect: false,
        action: 'reject',
      }),
    });
    if (!res.ok) {
      const errorJson: { error: string } = await res.json();
      throw new Error(errorJson.error || '却下処理に失敗しました');
    }
    setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
  };

  const pendingCount = meetings.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">承認フロー</h1>
          <p className="mt-1 text-sm text-text-secondary">
            承認待ち一覧: {loading ? '-' : pendingCount}件
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          loading={processing}
          onClick={handleProcess}
          disabled={processing}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {processing ? '処理中...' : '本日の議事録を取り込む'}
        </Button>
      </div>

      {processMessage && !error && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {processMessage}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            aria-label="閉じる"
            className="ml-auto shrink-0 rounded p-0.5 hover:bg-red-100"
            onClick={() => setError(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : pendingCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
          <CheckCircle className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm">全て完了しました</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {meetings.map((meeting) => (
            <ApprovalCard
              key={meeting.id}
              meeting={meeting}
              companies={companies}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
