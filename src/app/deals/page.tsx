'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeader,
} from '@/components/ui/table';
import {
  DEAL_PHASES,
  PHASE_LABEL,
  PROBABILITY_LABEL,
  PROBABILITY_COLOR,
} from '@/lib/constants';
import type { DealPhase, DealProbability, DealWithContact } from '@/types';

const TABS: { value: DealPhase | ''; label: string }[] = [
  { value: '', label: '全て' },
  ...DEAL_PHASES.map((p) => ({ value: p.id, label: p.name })),
];

type SortOrder = '' | 'asc' | 'desc';

const PAGE_SIZE = 50;

function DealsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [deals, setDeals] = useState<DealWithContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [phase, setPhase] = useState<DealPhase | ''>(
    (searchParams.get('phase') as DealPhase | '') ?? '',
  );
  const [page, setPage] = useState(Number(searchParams.get('page') ?? '1'));
  const [assignedToFilter, setAssignedToFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('');
  const [assignedToOptions, setAssignedToOptions] = useState<{ value: string; label: string }[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const fetchDeals = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const params = new URLSearchParams();
      if (phase) params.set('phase', phase);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));

      const res = await fetch(`/api/deals?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('データの取得に失敗しました');
      const json: { data: DealWithContact[]; total?: number } = await res.json();

      // 担当者一覧を抽出
      const uniqueAssignees = Array.from(
        new Set(json.data.map((d) => d.assigned_to).filter(Boolean))
      ).sort();
      setAssignedToOptions(
        uniqueAssignees.map((name) => ({ value: name, label: name }))
      );

      // クライアントサイドフィルタ: 担当者
      let filtered = json.data;
      if (assignedToFilter) {
        filtered = filtered.filter((d) => d.assigned_to === assignedToFilter);
      }

      // クライアントサイドソート: 次アクション日
      if (sortOrder === 'asc') {
        filtered = [...filtered].sort((a, b) => {
          if (!a.next_action_date && !b.next_action_date) return 0;
          if (!a.next_action_date) return 1;
          if (!b.next_action_date) return -1;
          return a.next_action_date.localeCompare(b.next_action_date);
        });
      } else if (sortOrder === 'desc') {
        filtered = [...filtered].sort((a, b) => {
          if (!a.next_action_date && !b.next_action_date) return 0;
          if (!a.next_action_date) return 1;
          if (!b.next_action_date) return -1;
          return b.next_action_date.localeCompare(a.next_action_date);
        });
      }

      setDeals(filtered);
      setTotal(json.total ?? json.data.length);
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
  }, [phase, page, assignedToFilter, sortOrder]);

  useEffect(() => {
    fetchDeals();
    return () => { abortRef.current?.abort(); };
  }, [fetchDeals]);

  const handlePhaseChange = (value: DealPhase | '') => {
    setPhase(value);
    setPage(1);
    const params = new URLSearchParams();
    if (value) params.set('phase', value);
    router.replace(`/deals?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    const params = new URLSearchParams();
    if (phase) params.set('phase', phase);
    params.set('page', String(newPage));
    router.replace(`/deals?${params.toString()}`);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text">案件ボード</h1>

      {/* フェーズタブ + 担当者フィルター */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => handlePhaseChange(tab.value as DealPhase | '')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                phase === tab.value
                  ? 'bg-accent/20 text-accent border-accent/30'
                  : 'bg-surface text-text-secondary border-border hover:bg-muted'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {assignedToOptions.length > 0 && (
          <div className="w-48">
            <Select
              options={assignedToOptions}
              value={assignedToFilter}
              onChange={(e) => {
                setAssignedToFilter(e.target.value);
                setPage(1);
              }}
              placeholder="担当者で絞り込み"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
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
      ) : deals.length === 0 ? (
        <div className="py-16 text-center text-sm text-text-secondary">
          案件がありません
        </div>
      ) : (
        <>
          {/* モバイル */}
          <div className="sm:hidden space-y-2">
            {deals.map((d) => (
              <Link
                key={d.id}
                href={`/deals/${d.id}`}
                className="block border border-border bg-surface p-3 hover:bg-muted/50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-accent truncate mr-2">
                    {d.has_movement && (
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2" />
                    )}
                    {d.title}
                  </span>
                  {d.probability && (
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${PROBABILITY_COLOR[d.probability]}`}>
                      {PROBABILITY_LABEL[d.probability]}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-secondary truncate">
                  {d.contact?.full_name ?? '-'}{d.contact?.company_name ? ` (${d.contact.company_name})` : ''}
                </p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-text truncate">{d.next_action ?? '-'}</span>
                  <span className="text-xs text-text-secondary">{d.next_action_date ?? '-'}</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  {d.deliverable && <span className="text-xs text-text-secondary">{d.deliverable}</span>}
                  {d.revenue != null && <span className="text-xs text-text-secondary">{d.revenue.toLocaleString()}円</span>}
                </div>
              </Link>
            ))}
          </div>

          {/* デスクトップ */}
          <div className="hidden sm:block">
            <Card>
              <Table>
                {phase === 'active' ? (
                  <>
                    <TableHead>
                      <tr>
                        <TableHeader>案件名</TableHeader>
                        <TableHeader>コンタクト</TableHeader>
                        <TableHeader>制作物</TableHeader>
                        <TableHeader>報酬</TableHeader>
                        <TableHeader>納期</TableHeader>
                        <TableHeader>担当者</TableHeader>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {deals.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell>
                            <Link href={`/deals/${d.id}`} className="text-accent hover:underline font-medium">
                              {d.has_movement && (
                                <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2" />
                              )}
                              {d.title}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {d.contact?.full_name ?? '-'}
                            {d.contact?.company_name ? (
                              <span className="text-text-secondary ml-1">({d.contact.company_name})</span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <span className="truncate max-w-[200px] inline-block">{d.deliverable ?? '-'}</span>
                          </TableCell>
                          <TableCell>{d.revenue != null ? `${d.revenue.toLocaleString()}円` : '-'}</TableCell>
                          <TableCell>{d.deadline ?? '-'}</TableCell>
                          <TableCell>{d.assigned_to ?? '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </>
                ) : (
                  <>
                    <TableHead>
                      <tr>
                        <TableHeader>案件名</TableHeader>
                        <TableHeader>コンタクト</TableHeader>
                        <TableHeader>受注確率</TableHeader>
                        <TableHeader>次アクション</TableHeader>
                        <TableHeader>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:text-accent transition-colors"
                            onClick={() => {
                              setSortOrder((prev) =>
                                prev === '' ? 'asc' : prev === 'asc' ? 'desc' : ''
                              );
                            }}
                          >
                            次アクション日
                            {sortOrder === '' && <ArrowUpDown className="h-3.5 w-3.5" />}
                            {sortOrder === 'asc' && <ArrowUp className="h-3.5 w-3.5 text-accent" />}
                            {sortOrder === 'desc' && <ArrowDown className="h-3.5 w-3.5 text-accent" />}
                          </button>
                        </TableHeader>
                        <TableHeader>担当者</TableHeader>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {deals.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell>
                            <Link href={`/deals/${d.id}`} className="text-accent hover:underline font-medium">
                              {d.has_movement && (
                                <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2" />
                              )}
                              {d.title}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {d.contact?.full_name ?? '-'}
                            {d.contact?.company_name ? (
                              <span className="text-text-secondary ml-1">({d.contact.company_name})</span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            {d.probability ? (
                              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${PROBABILITY_COLOR[d.probability]}`}>
                                {PROBABILITY_LABEL[d.probability]}
                              </span>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="truncate max-w-[200px] inline-block">{d.next_action ?? '-'}</span>
                          </TableCell>
                          <TableCell>{d.next_action_date ?? '-'}</TableCell>
                          <TableCell>{d.assigned_to ?? '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </>
                )}
              </Table>
            </Card>
          </div>

          {/* ページネーション */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
              >
                前へ
              </Button>
              <span className="text-sm text-text-secondary">
                {page} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => handlePageChange(page + 1)}
              >
                次へ
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function DealsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <h1 className="text-xl font-semibold text-text">案件ボード</h1>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      }
    >
      <DealsContent />
    </Suspense>
  );
}
