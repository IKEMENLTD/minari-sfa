/* eslint-disable @next/next/no-img-element */
'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Search, RefreshCw, Video } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeader,
} from '@/components/ui/table';
import { TOOL_LABEL } from '@/lib/constants';
import type { MeetingRow, ContactRow, MeetingTool } from '@/types';

interface MeetingListItem extends MeetingRow {
  contact: ContactRow | null;
  summary_text?: string | null;
}

type UnlinkedFilter = '' | 'true';

const FILTER_TABS: { value: UnlinkedFilter; label: string }[] = [
  { value: '', label: '全て' },
  { value: 'true', label: '未紐付け' },
];

const PAGE_SIZE = 50;

const SOURCE_LABEL: Record<string, string> = {
  tldv: 'tl;dv',
  teams_copilot: 'Teams Copilot',
  manual: '手動',
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

function MeetingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [unlinked, setUnlinked] = useState<UnlinkedFilter>(
    (searchParams.get('unlinked') as UnlinkedFilter) ?? '',
  );
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') ?? '');
  const [page, setPage] = useState(Number(searchParams.get('page') ?? '1'));
  const abortRef = useRef<AbortController | null>(null);

  const fetchMeetings = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const params = new URLSearchParams();
      if (unlinked) params.set('unlinked', 'true');
      if (searchQuery) params.set('search', searchQuery);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));

      const res = await fetch(`/api/meetings?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('データの取得に失敗しました');
      const json: { data: MeetingListItem[]; total?: number } = await res.json();

      // クライアントサイドでコンタクト名・タイトルフィルタ（APIにsearchがなくても対応）
      let filtered = json.data;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (m) => m.contact?.full_name?.toLowerCase().includes(q)
            || m.title?.toLowerCase().includes(q)
        );
      }

      setMeetings(filtered);
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
  }, [unlinked, searchQuery, page]);

  useEffect(() => {
    fetchMeetings();
    return () => { abortRef.current?.abort(); };
  }, [fetchMeetings]);

  const updateUrl = (newUnlinked: UnlinkedFilter, newSearch: string, newPage: number) => {
    const params = new URLSearchParams();
    if (newUnlinked) params.set('unlinked', newUnlinked);
    if (newSearch) params.set('search', newSearch);
    if (newPage > 1) params.set('page', String(newPage));
    router.replace(`/meetings?${params.toString()}`);
  };

  const handleFilterChange = (value: UnlinkedFilter) => {
    setUnlinked(value);
    setPage(1);
    updateUrl(value, searchQuery, 1);
  };

  const handleSearch = () => {
    setPage(1);
    updateUrl(unlinked, searchQuery, 1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    updateUrl(unlinked, searchQuery, newPage);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/tldv/sync', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setSyncMessage(`同期エラー: ${json.error ?? '不明なエラー'}`);
        return;
      }
      const result = json.data;
      const debugInfo = `（tldv: ${result.tldvTotal ?? '?'}件, DB既存: ${result.existingCount ?? '?'}件）`;
      const errorInfo = result.errors?.length > 0 ? `\nエラー: ${result.errors.slice(0, 3).join(' / ')}` : '';
      if (result.synced === 0 && (!result.errors || result.errors.length === 0)) {
        setSyncMessage(`新しい会議はありませんでした${debugInfo}`);
      } else if (result.synced === 0) {
        setSyncMessage(`${result.tldvTotal ?? '?'}件取得しましたが全て保存に失敗しました${debugInfo}${errorInfo}`);
      } else {
        setSyncMessage(`${result.synced}件の会議を同期しました${result.errors.length > 0 ? `（${result.errors.length}件エラー）` : ''}`);
        fetchMeetings();
      }
    } catch {
      setSyncMessage('tldv同期中にエラーが発生しました');
    } finally {
      setSyncing(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text">会議記録</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? '同期中...' : 'tldvから同期'}
          </Button>
          <Link
            href="/meetings/new"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-all"
          >
            会議を登録
          </Link>
        </div>
      </div>

      {syncMessage && (
        <div className={`rounded-md border px-4 py-3 text-sm whitespace-pre-wrap ${
          syncMessage.includes('エラー')
            ? 'border-red-500/30 bg-red-500/10 text-red-400'
            : 'border-green-500/30 bg-green-500/10 text-green-400'
        }`}>
          {syncMessage}
        </div>
      )}

      {/* コンタクト名検索 */}
      <div className="flex gap-2">
        <div className="flex-1 max-w-xs">
          <Input
            placeholder="タイトル・コンタクト名で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={handleSearch}>
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {/* フィルタータブ */}
      <div className="flex flex-wrap gap-2" role="tablist">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={unlinked === tab.value}
            onClick={() => handleFilterChange(tab.value)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
              unlinked === tab.value
                ? 'bg-accent/20 text-accent border-accent/30'
                : 'bg-surface text-text-secondary border-border hover:bg-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
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
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : meetings.length === 0 ? (
        <div className="py-16 text-center text-sm text-text-secondary space-y-3">
          {searchQuery || unlinked === 'true' ? (
            <p>条件に一致する会議記録がありません</p>
          ) : (
            <>
              <p>会議記録がまだありません。最初の会議を登録しましょう</p>
              <Link
                href="/meetings/new"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-all"
              >
                会議を登録
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          {/* モバイル */}
          <div className="sm:hidden space-y-2">
            {meetings.map((m) => (
              <Link
                key={m.id}
                href={`/meetings/${m.id}`}
                className="flex items-start gap-3 border border-border bg-surface p-3 hover:bg-muted/50"
              >
                {/* サムネイル */}
                <div className="shrink-0 w-12 h-12 rounded bg-muted flex items-center justify-center overflow-hidden">
                  {m.thumbnail_url ? (
                    <img src={m.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Video className="h-5 w-5 text-text-secondary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-text truncate">
                      {m.title || new Date(m.meeting_date).toLocaleDateString('ja-JP')}
                    </span>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {m.tool && <Badge variant="info">{TOOL_LABEL[m.tool] ?? m.tool}</Badge>}
                      {!m.contact_id && <Badge variant="warning">未紐付け</Badge>}
                    </div>
                  </div>
                  {m.title && (
                    <p className="text-xs text-text-secondary">
                      {new Date(m.meeting_date).toLocaleDateString('ja-JP')}
                    </p>
                  )}
                  <p className="text-sm text-text">{m.contact?.full_name ?? '未紐付け'}</p>
                  {m.summary_text && (
                    <p className="text-xs text-text-secondary mt-1 truncate">{truncate(m.summary_text, 60)}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* デスクトップ */}
          <div className="hidden sm:block">
            <Card>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeader className="w-10"></TableHeader>
                    <TableHeader>タイトル / 日時</TableHeader>
                    <TableHeader>コンタクト</TableHeader>
                    <TableHeader>ツール</TableHeader>
                    <TableHeader>ソース</TableHeader>
                    <TableHeader>要約</TableHeader>
                  </tr>
                </TableHead>
                <TableBody>
                  {meetings.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden">
                          {m.thumbnail_url ? (
                            <img src={m.thumbnail_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Video className="h-4 w-4 text-text-secondary" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link href={`/meetings/${m.id}`} className="text-accent hover:underline font-medium">
                          {m.title || new Date(m.meeting_date).toLocaleDateString('ja-JP')}
                        </Link>
                        {m.title && (
                          <p className="text-xs text-text-secondary mt-0.5">
                            {new Date(m.meeting_date).toLocaleDateString('ja-JP')}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {m.contact ? (
                          m.contact.full_name
                        ) : (
                          <Badge variant="warning">未紐付け</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {m.tool ? <Badge variant="info">{TOOL_LABEL[m.tool] ?? m.tool}</Badge> : '-'}
                      </TableCell>
                      <TableCell>{SOURCE_LABEL[m.source] ?? m.source}</TableCell>
                      <TableCell>
                        <span className="truncate max-w-[250px] inline-block text-text-secondary">
                          {m.summary_text ? truncate(m.summary_text, 80) : '-'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
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

export default function MeetingsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <h1 className="text-xl font-semibold text-text">会議記録</h1>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      }
    >
      <MeetingsContent />
    </Suspense>
  );
}
