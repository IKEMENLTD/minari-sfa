'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CheckCircle,
  Briefcase,
  MessageSquare,
  RefreshCw,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeader,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import type { MeetingRow, DealWithDetails } from '@/types';
import type { BadgeVariant } from '@/components/ui/badge';

interface DashboardData {
  pendingCount: number;
  activeDealsCount: number;
  weeklyMeetingsCount: number;
  recentPending: MeetingRow[];
  recentDeals: DealWithDetails[];
}

const statusVariant: Record<string, BadgeVariant> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

interface SummaryCardProps {
  icon: typeof CheckCircle;
  label: string;
  value: number | string;
  loading: boolean;
}

function SummaryCard({ icon: Icon, label, value, loading }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100">
          <Icon className="h-5 w-5 text-text-secondary" />
        </div>
        <div>
          <p className="text-xs font-medium text-text-secondary">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-12" />
          ) : (
            <p className="text-xl font-semibold text-text">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true);
      setError(null);
      try {
        const [meetingsRes, dealsRes] = await Promise.all([
          fetch('/api/meetings'),
          fetch('/api/deals'),
        ]);
        if (!meetingsRes.ok || !dealsRes.ok) {
          throw new Error('データの取得に失敗しました');
        }
        const meetingsJson: { data: MeetingRow[] } = await meetingsRes.json();
        const dealsJson: { data: DealWithDetails[] } = await dealsRes.json();

        const meetings = meetingsJson.data;
        const deals = dealsJson.data;

        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const pending = meetings.filter((m) => m.approval_status === 'pending');
        const weeklyMeetings = meetings.filter(
          (m) => new Date(m.meeting_date) >= weekAgo,
        );

        setData({
          pendingCount: pending.length,
          activeDealsCount: deals.length,
          weeklyMeetingsCount: weeklyMeetings.length,
          recentPending: pending.slice(0, 5),
          recentDeals: deals.slice(0, 5),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'エラーが発生しました');
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-text">ダッシュボード</h1>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* サマリーカード */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={CheckCircle}
          label="承認待ち"
          value={data?.pendingCount ?? 0}
          loading={loading}
        />
        <SummaryCard
          icon={Briefcase}
          label="進行中の案件"
          value={data?.activeDealsCount ?? 0}
          loading={loading}
        />
        <SummaryCard
          icon={MessageSquare}
          label="今週の商談"
          value={data?.weeklyMeetingsCount ?? 0}
          loading={loading}
        />
        <SummaryCard
          icon={RefreshCw}
          label="直近更新"
          value={data?.recentDeals.length ?? 0}
          loading={loading}
        />
      </div>

      {/* 承認待ち商談 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-text">承認待ち商談</h2>
          <Link
            href="/approval"
            className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
          >
            全て見る
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <Card>
          <Table>
            <TableHead>
              <tr>
                <TableHeader>日付</TableHeader>
                <TableHeader>推定企業</TableHeader>
                <TableHeader>ソース</TableHeader>
                <TableHeader>ステータス</TableHeader>
              </tr>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 4 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data && data.recentPending.length > 0 ? (
                data.recentPending.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Link
                        href={`/meetings/${m.id}`}
                        className="text-accent hover:underline"
                      >
                        {new Date(m.meeting_date).toLocaleDateString('ja-JP')}
                      </Link>
                    </TableCell>
                    <TableCell>{m.ai_estimated_company || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="info">{m.source}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[m.approval_status] || 'default'}>
                        承認待ち
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-secondary">
                    承認待ちの商談はありません
                  </td>
                </tr>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* 注目案件 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-text">注目案件</h2>
          <Link
            href="/deals"
            className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
          >
            全て見る
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <Card>
          <Table>
            <TableHead>
              <tr>
                <TableHeader>企業名</TableHeader>
                <TableHeader>フェーズ</TableHeader>
                <TableHeader>ネクストアクション</TableHeader>
                <TableHeader>担当者</TableHeader>
              </tr>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 4 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data && data.recentDeals.length > 0 ? (
                data.recentDeals.map((d) => (
                  <TableRow key={d.deal_status.id}>
                    <TableCell>
                      <Link
                        href={`/deals/${d.deal_status.id}`}
                        className="text-accent hover:underline font-medium"
                      >
                        {d.company.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="info">{d.phase.phase_name}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="truncate max-w-[200px] inline-block">
                        {d.deal_status.next_action || '-'}
                      </span>
                    </TableCell>
                    <TableCell>{d.company.assigned_to || '-'}</TableCell>
                  </TableRow>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-secondary">
                    案件がありません
                  </td>
                </tr>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
