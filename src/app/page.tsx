'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Calendar,
  Briefcase,
  MessageSquare,
  Clock,
  FileText,
  Play,
  Upload,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeader,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { PHASE_LABEL, TOOL_LABEL } from '@/lib/constants';
import { formatDateShort, daysAgo } from '@/lib/format';
import type { DealPhase, MeetingTool } from '@/types';

interface ReminderItem {
  id: string;
  title: string;
  contact_name: string;
  company_name: string | null;
  next_action: string | null;
  next_action_date: string | null;
  phase: DealPhase;
  contact?: { full_name: string; company_name: string | null } | null;
}

interface PhaseSummaryItem {
  phase: DealPhase;
  count: number;
  revenue: number;
}

interface RecentMeetingItem {
  id: string;
  contact_name: string | null;
  meeting_date: string;
  tool: MeetingTool | null;
  contact?: { id: string; full_name: string; company_name: string | null } | null;
}

interface InquiryMonthlySummaryItem {
  month: string;
  total: number;
}

interface StaleDealItem {
  id: string;
  title: string;
  phase: string;
  updated_at: string;
  contact: { full_name: string; company_name: string | null } | null;
}

interface DashboardData {
  reminders: ReminderItem[];
  phaseSummary: PhaseSummaryItem[];
  recentMeetings: RecentMeetingItem[];
  unhandledInquiries: number;
  inquiryMonthly: InquiryMonthlySummaryItem[];
  staleDeals: StaleDealItem[];
}

function isOverdue(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

function isToday(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d.getTime() === today.getTime();
}

function isTomorrow(dateStr: string): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d.getTime() === tomorrow.getTime();
}

const PHASE_ORDER: DealPhase[] = ['proposal_planned', 'proposal_active', 'waiting', 'follow_up', 'active'];

const PHASE_ICONS: Record<DealPhase, typeof Briefcase> = {
  proposal_planned: Calendar,
  proposal_active: Briefcase,
  waiting: Clock,
  follow_up: MessageSquare,
  active: Play,
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch('/api/dashboard', { signal: controller.signal });
      if (!res.ok) throw new Error('データの取得に失敗しました');
      const json: { data: DashboardData } = await res.json();
      setData(json.data);
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
    fetchData();
    return () => { abortRef.current?.abort(); };
  }, [fetchData]);

  return (
    <div className="space-y-6 overflow-x-hidden">
      <h1 className="text-xl font-semibold text-text">ホーム</h1>

      {error && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
          <div>
            <Button variant="secondary" size="sm" onClick={fetchData}>
              再試行
            </Button>
          </div>
        </div>
      )}

      {/* フェーズ別案件サマリー */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {PHASE_ORDER.map((phase) => {
          const Icon = PHASE_ICONS[phase];
          const count = data?.phaseSummary.find((s) => s.phase === phase)?.count ?? 0;
          return (
            <Link key={phase} href={`/deals?phase=${phase}`} className="block cursor-pointer">
              <Card className="hover:border-accent/50 transition-colors">
                <CardContent className="flex items-center gap-4 py-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                    <Icon className="h-5 w-5 text-text-secondary" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-text-secondary">{PHASE_LABEL[phase]}</p>
                    {loading ? (
                      <Skeleton className="mt-1 h-6 w-12" />
                    ) : (
                      <p className="text-xl font-semibold text-text">{count}件</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* フェーズ別売上サマリー */}
      {!loading && data && data.phaseSummary.some((s) => s.revenue > 0) && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text">フェーズ別売上パイプライン</h2>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {PHASE_ORDER.map((phase) => {
                const item = data.phaseSummary.find((s) => s.phase === phase);
                const revenue = item?.revenue ?? 0;
                const totalRevenue = data.phaseSummary.reduce((sum, s) => sum + s.revenue, 0);
                const pct = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;
                return (
                  <div key={phase} className="flex items-center gap-3">
                    <span className="text-xs text-text-secondary w-24 shrink-0">{PHASE_LABEL[phase]}</span>
                    <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent/60 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-text w-28 text-right shrink-0">
                      {revenue.toLocaleString()}円
                    </span>
                  </div>
                );
              })}
              <div className="border-t border-border pt-2 mt-2 flex items-center justify-between">
                <span className="text-sm font-medium text-text">合計</span>
                <span className="text-sm font-semibold text-text">
                  {data.phaseSummary.reduce((sum, s) => sum + s.revenue, 0).toLocaleString()}円
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 未対応問い合わせ + 月別件数 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/inquiries?status=new" className="block cursor-pointer">
          <Card className="hover:border-accent/50 transition-colors">
            <CardContent className="flex items-center gap-4 py-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                <FileText className="h-5 w-5 text-text-secondary" />
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary">未対応問い合わせ</p>
                {loading ? (
                  <Skeleton className="mt-1 h-6 w-12" />
                ) : (
                  <p className="text-xl font-semibold text-text">{data?.unhandledInquiries ?? 0}件</p>
                )}
              </div>
            </CardContent>
          </Card>
        </Link>
        {(data?.inquiryMonthly ?? []).slice(0, 2).map((m) => (
          <Card key={m.month}>
            <CardContent className="flex items-center gap-4 py-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                <MessageSquare className="h-5 w-5 text-text-secondary" />
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary">{m.month} 問い合わせ</p>
                {loading ? (
                  <Skeleton className="mt-1 h-6 w-12" />
                ) : (
                  <p className="text-xl font-semibold text-text">{m.total}件</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 放置案件アラート */}
      {!loading && data && data.staleDeals.length > 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <div className="p-4">
            <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4" />
              放置案件（14日以上更新なし）
              <Badge variant="danger">{data.staleDeals.length}件</Badge>
            </h3>
            <div className="space-y-2">
              {data.staleDeals.map((deal) => (
                <Link
                  key={deal.id}
                  href={`/deals/${deal.id}`}
                  className="flex items-center justify-between border border-red-500/20 bg-red-500/5 p-3 hover:bg-red-500/10 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-accent">
                      {deal.title}
                    </span>
                    {deal.contact && (
                      <span className="text-xs text-text-secondary ml-2">
                        ({deal.contact.full_name}
                        {deal.contact.company_name ? ` / ${deal.contact.company_name}` : ''})
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-red-400 font-medium whitespace-nowrap ml-3">
                    {daysAgo(deal.updated_at)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* 本日のリマインド */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-text">リマインド</h2>
          <Link
            href="/deals"
            className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
          >
            案件一覧
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {loading ? (
          <Card>
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </Card>
        ) : data && data.reminders.length > 0 ? (
          <>
            {/* モバイル */}
            <div className="sm:hidden space-y-2">
              {data.reminders.slice(0, 20).map((r) => {
                const overdue = r.next_action_date ? isOverdue(r.next_action_date) : false;
                const today = r.next_action_date ? isToday(r.next_action_date) : false;
                const tomorrow = r.next_action_date ? isTomorrow(r.next_action_date) : false;
                return (
                  <Link
                    key={r.id}
                    href={`/deals/${r.id}`}
                    className={`block border p-3 hover:bg-muted/50 ${
                      overdue
                        ? 'border-red-500/30 bg-red-500/10'
                        : today
                          ? 'border-yellow-500/30 bg-yellow-500/10'
                          : tomorrow
                            ? 'border-blue-500/30 bg-blue-500/10'
                            : 'border-border bg-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-accent">{r.title}</span>
                      <Badge variant={overdue ? 'danger' : today ? 'warning' : tomorrow ? 'info' : 'default'}>
                        {r.next_action_date ? (tomorrow ? `明日 ${formatDateShort(r.next_action_date)}` : formatDateShort(r.next_action_date)) : '-'}
                      </Badge>
                    </div>
                    <p className="text-xs text-text-secondary truncate">
                      {r.contact?.full_name ?? r.contact_name}{(r.contact?.company_name ?? r.company_name) ? ` (${r.contact?.company_name ?? r.company_name})` : ''}
                    </p>
                    <p className="text-xs text-text truncate mt-0.5">{r.next_action ?? '-'}</p>
                  </Link>
                );
              })}
            </div>
            {/* デスクトップ */}
            <div className="hidden sm:block">
              <Card>
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeader>案件名</TableHeader>
                      <TableHeader>コンタクト</TableHeader>
                      <TableHeader>次アクション</TableHeader>
                      <TableHeader>期日</TableHeader>
                      <TableHeader>フェーズ</TableHeader>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {data.reminders.slice(0, 20).map((r) => {
                      const overdue = r.next_action_date ? isOverdue(r.next_action_date) : false;
                      const today = r.next_action_date ? isToday(r.next_action_date) : false;
                      const tomorrow = r.next_action_date ? isTomorrow(r.next_action_date) : false;
                      return (
                        <TableRow
                          key={r.id}
                          className={
                            overdue
                              ? 'bg-red-500/10'
                              : today
                                ? 'bg-yellow-500/10'
                                : tomorrow
                                  ? 'bg-blue-500/10'
                                  : ''
                          }
                        >
                          <TableCell>
                            <Link href={`/deals/${r.id}`} className="text-accent hover:underline font-medium">
                              {r.title}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {r.contact?.full_name ?? r.contact_name}{(r.contact?.company_name ?? r.company_name) ? ` (${r.contact?.company_name ?? r.company_name})` : ''}
                          </TableCell>
                          <TableCell>
                            <span className="truncate max-w-[200px] inline-block">{r.next_action ?? '-'}</span>
                          </TableCell>
                          <TableCell>
                            <span className={overdue ? 'text-red-400 font-medium' : today ? 'text-yellow-400 font-medium' : tomorrow ? 'text-blue-400 font-medium' : ''}>
                              {r.next_action_date ? (tomorrow ? `明日 ${formatDateShort(r.next_action_date)}` : formatDateShort(r.next_action_date)) : '-'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="info">{PHASE_LABEL[r.phase]}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </div>
          </>
        ) : (
          <div className="py-8 text-center text-sm text-text-secondary">
            リマインド対象の案件はありません
          </div>
        )}
      </div>

      {/* 最近の会議 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-text">最近の会議</h2>
          <Link
            href="/meetings"
            className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
          >
            全て見る
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {loading ? (
          <Card>
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </Card>
        ) : data && data.recentMeetings.length > 0 ? (
          <>
            <div className="sm:hidden space-y-2">
              {data.recentMeetings.slice(0, 5).map((m) => (
                <Link key={m.id} href={`/meetings/${m.id}`} className="block border border-border bg-surface p-3 hover:bg-muted/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-accent">
                      {new Date(m.meeting_date).toLocaleDateString('ja-JP')}
                    </span>
                    {m.tool && <Badge variant="info">{TOOL_LABEL[m.tool] ?? m.tool}</Badge>}
                  </div>
                  <p className="text-sm text-text">{m.contact?.full_name ?? m.contact_name ?? '未紐付け'}</p>
                </Link>
              ))}
            </div>
            <div className="hidden sm:block">
              <Card>
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeader>日時</TableHeader>
                      <TableHeader>コンタクト</TableHeader>
                      <TableHeader>ツール</TableHeader>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {data.recentMeetings.slice(0, 5).map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <Link href={`/meetings/${m.id}`} className="text-accent hover:underline">
                            {new Date(m.meeting_date).toLocaleDateString('ja-JP')}
                          </Link>
                        </TableCell>
                        <TableCell>{m.contact?.full_name ?? m.contact_name ?? '未紐付け'}</TableCell>
                        <TableCell>
                          {m.tool ? <Badge variant="info">{TOOL_LABEL[m.tool] ?? m.tool}</Badge> : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          </>
        ) : (
          <div className="py-8 text-center text-sm text-text-secondary">
            会議記録はありません
          </div>
        )}
      </div>

      {/* データインポート導線 */}
      <div className="border-t border-border pt-4 mt-2">
        <Link
          href="/import"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors"
        >
          <Upload className="h-4 w-4" />
          データインポート（CSV / TSV）
        </Link>
      </div>
    </div>
  );
}
