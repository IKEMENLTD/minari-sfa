'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { ApprovalCard } from '@/components/meetings/approval-card';
import { SkeletonCard } from '@/components/ui/skeleton';
import type { MeetingRow, CompanyRow } from '@/types';

export default function ApprovalPage() {
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
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
    };
    fetchData();
  }, []);

  const handleApprove = async (
    meetingId: string,
    isCorrect: boolean,
    correctedCompany?: string,
    correctionNote?: string,
  ) => {
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
    if (!res.ok) throw new Error('承認処理に失敗しました');
    setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
  };

  const pendingCount = meetings.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text">承認フロー</h1>
        <p className="mt-1 text-sm text-text-secondary">
          本日の承認待ち: {loading ? '-' : pendingCount}件
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
