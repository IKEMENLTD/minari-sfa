'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, AlertCircle } from 'lucide-react';
import { MeetingDetailView } from '@/components/meetings/meeting-detail';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { MeetingDetail } from '@/types';

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchMeeting = useCallback(async () => {
    if (!id) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(`/api/meetings/${id}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('議事録が見つかりませんでした');
        }
        throw new Error('データの取得に失敗しました');
      }
      const json: { data: MeetingDetail; error: string | null } = await res.json();
      if (json.error) throw new Error(json.error);
      setMeeting(json.data);
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
  }, [id]);

  useEffect(() => {
    fetchMeeting();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchMeeting]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
          <p className="text-sm">議事録が見つかりませんでした</p>
          <div className="mt-3 flex gap-2">
            <Link href="/meetings" className="text-sm text-accent hover:underline">
              一覧に戻る
            </Link>
            <Button variant="secondary" size="sm" onClick={fetchMeeting}>
              再試行
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-text-secondary">
        <Link href="/meetings" className="hover:text-accent">
          商談記録
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-text">
          {meeting.company?.name || meeting.ai_estimated_company || '詳細'}
        </span>
      </nav>

      <MeetingDetailView meeting={meeting} />
    </div>
  );
}
