'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, Sheet, CheckCircle } from 'lucide-react';
import { DealList } from '@/components/deals/deal-list';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { DealWithDetails } from '@/types';

export default function DealsPage() {
  const [deals, setDeals] = useState<DealWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const fetchDeals = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch('/api/deals', { signal: controller.signal });
      if (!res.ok) throw new Error('データの取得に失敗しました');
      const json: { data: DealWithDetails[] } = await res.json();
      setDeals(json.data);
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
  }, []);

  useEffect(() => {
    fetchDeals();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchDeals]);

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const handleSheetSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/sheets/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const errJson: { error: string } = await res.json();
        throw new Error(errJson.error || '同期に失敗しました');
      }
      const json: { data: { companyCount: number; meetingCount: number } } = await res.json();
      setSyncMessage(`同期完了: 企業 ${json.data.companyCount}件 / 商談 ${json.data.meetingCount}件`);
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : '同期に失敗しました');
    } finally {
      setSyncing(false);
    }
  };

  const filtered = deals.filter((d) =>
    (d.company?.name ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">案件ボード</h1>
          {syncMessage && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-text-secondary">
              <CheckCircle className="h-3 w-3" />
              {syncMessage}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSheetSync}
            loading={syncing}
            disabled={syncing}
            data-guide="sync-button"
          >
            <Sheet className="h-3.5 w-3.5" />
            {syncing ? '同期中...' : 'スプシに同期'}
          </Button>
          <div className="w-full sm:w-56">
            <Input
              placeholder="企業名で検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
          <div>
            <Button variant="secondary" size="sm" onClick={fetchDeals}>
              再試行
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <DealList deals={filtered} />
      )}
    </div>
  );
}
