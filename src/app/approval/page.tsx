'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, AlertCircle, RefreshCw, X, Calendar } from 'lucide-react';
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
  const [showDateRange, setShowDateRange] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal: controller.signal,
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
        message += `\nエラー: ${result.errors.join(' / ')}`;
      }

      setProcessMessage(message);
      // 取り込み後にpending一覧をリロード
      await fetchData();
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setError('タイムアウトしました（30秒）。再試行してください。');
      } else {
        setError(e instanceof Error ? e.message : '議事録の取り込みに失敗しました');
      }
      setProcessMessage(null);
    } finally {
      clearTimeout(timer);
      setProcessing(false);
    }
  };

  const handleProcessRange = async () => {
    if (!dateFrom || !dateTo) return;
    setProcessing(true);
    setProcessMessage('過去の議事録を取り込み中...');
    setError(null);
    const rangeController = new AbortController();
    const rangeTimer = setTimeout(() => rangeController.abort(), 30000);
    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: dateFrom, to: dateTo }),
        signal: rangeController.signal,
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
          : '指定期間に新しい議事録はありませんでした';

      if (result.errors.length > 0) {
        message += `\nエラー: ${result.errors.join(' / ')}`;
      }

      setProcessMessage(message);
      setShowDateRange(false);
      setDateFrom('');
      setDateTo('');
      await fetchData();
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setError('タイムアウトしました（30秒）。再試行してください。');
      } else {
        setError(e instanceof Error ? e.message : '議事録の取り込みに失敗しました');
      }
      setProcessMessage(null);
    } finally {
      clearTimeout(rangeTimer);
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
    const json: { data: { ai_estimated_company: string; corrected_company: string | null } } = await res.json();
    const companyName = json.data.corrected_company ?? json.data.ai_estimated_company;
    if (companyName && companyName !== '(社内)') {
      setProcessMessage(`「${companyName}」を案件管理に登録しました`);
    } else {
      setProcessMessage('承認しました');
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
    await fetchData();
  };

  const pendingCount = meetings.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">取り込み・承認</h1>
          <p className="mt-1 text-sm text-text-secondary">
            承認待ち一覧: {loading ? '-' : pendingCount}件
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            loading={processing}
            onClick={handleProcess}
            disabled={processing}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {processing ? '処理中...' : '新しい議事録を取り込む'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowDateRange((prev) => !prev)}
            disabled={processing}
          >
            <Calendar className="h-3.5 w-3.5" />
            過去の議事録を取り込む
          </Button>
        </div>
      </div>

      {showDateRange && (
        <div className="border border-border bg-surface p-4">
          <div className="grid grid-cols-2 sm:flex sm:items-end gap-3">
            <div>
              <label htmlFor="date-from" className="block text-xs text-text-secondary mb-1">
                開始日
              </label>
              <input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                disabled={processing}
                className="w-full border border-border bg-surface px-2 py-1 text-sm text-text"
              />
            </div>
            <div>
              <label htmlFor="date-to" className="block text-xs text-text-secondary mb-1">
                終了日
              </label>
              <input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                disabled={processing}
                className="w-full border border-border bg-surface px-2 py-1 text-sm text-text"
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleProcessRange}
              disabled={processing || !dateFrom || !dateTo}
              loading={processing}
              className="col-span-1"
            >
              取り込む
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowDateRange(false);
                setDateFrom('');
                setDateTo('');
              }}
              disabled={processing}
              className="col-span-1"
            >
              キャンセル
            </Button>
          </div>
        </div>
      )}

      {processMessage && !error && (
        <div className="flex items-start gap-2 border border-border bg-surface px-4 py-3 text-sm text-text-secondary whitespace-pre-line">
          <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
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
