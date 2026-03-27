'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MeetingList } from '@/components/meetings/meeting-list';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { SkeletonTableRow } from '@/components/ui/skeleton';
import { Table, TableHead, TableBody, TableHeader } from '@/components/ui/table';
import { AlertCircle } from 'lucide-react';
import type { MeetingRow } from '@/types';

type FilterStatus = '' | 'pending' | 'approved' | 'rejected';

const statusOptions = [
  { value: '', label: '全て' },
  { value: 'pending', label: '承認待ち' },
  { value: 'approved', label: '承認済み' },
  { value: 'rejected', label: '却下' },
];

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('');
  const abortRef = useRef<AbortController | null>(null);

  const fetchMeetings = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('approval_status', statusFilter);
      const res = await fetch(`/api/meetings?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('データの取得に失敗しました');
      const json: { data: MeetingRow[] } = await res.json();
      setMeetings(json.data);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setError('タイムアウトしました。再試行してください。');
      } else {
        setError(e instanceof Error ? e.message : 'エラーが発生しました');
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchMeetings();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchMeetings]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">議事録一覧</h1>
        <div className="w-48">
          <Select
            options={statusOptions}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
            placeholder="ステータスで絞り込み"
          />
        </div>
      </div>

      {error && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
          <div>
            <Button variant="secondary" size="sm" onClick={fetchMeetings}>
              再試行
            </Button>
          </div>
        </div>
      )}

      {loading ? (
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
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonTableRow key={i} columns={5} />
            ))}
          </TableBody>
        </Table>
      ) : (
        <MeetingList meetings={meetings} />
      )}
    </div>
  );
}
