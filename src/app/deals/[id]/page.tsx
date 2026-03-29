'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, AlertCircle } from 'lucide-react';
import { DealCard } from '@/components/deals/deal-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { DealWithDetails, SalesPhaseRow } from '@/types';

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [deal, setDeal] = useState<DealWithDetails | null>(null);
  const [phases, setPhases] = useState<SalesPhaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchDeal = useCallback(async () => {
    if (!id) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const [dealRes, phasesRes] = await Promise.all([
        fetch(`/api/deals/${id}`, { signal: controller.signal }),
        fetch('/api/phases', { signal: controller.signal }),
      ]);

      if (!dealRes.ok) {
        throw new Error(dealRes.status === 404 ? '案件が見つかりませんでした' : 'データの取得に失敗しました');
      }
      if (!phasesRes.ok) {
        throw new Error('フェーズデータの取得に失敗しました');
      }

      const dealJson: { data: DealWithDetails; error: string | null } = await dealRes.json();
      const phasesJson: { data: SalesPhaseRow[]; error: string | null } = await phasesRes.json();

      if (dealJson.error) throw new Error(dealJson.error);
      setDeal(dealJson.data);
      setPhases(phasesJson.data ?? []);
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
    fetchDeal();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchDeal]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-64 w-full max-w-xl" />
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
          <p className="text-sm">案件が見つかりませんでした</p>
          <div className="mt-3 flex gap-2">
            <Link href="/deals" className="text-sm text-accent hover:underline">
              一覧に戻る
            </Link>
            <Button variant="secondary" size="sm" onClick={fetchDeal}>
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
        <Link href="/deals" className="hover:text-accent">
          案件ボード
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-text">{deal.company?.name ?? '未登録'}</span>
      </nav>

      <div className="max-w-xl">
        <DealCard deal={deal} allPhases={phases} />
      </div>
    </div>
  );
}
