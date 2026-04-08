'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, AlertCircle, Save } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  TIER_LABEL,
  TOOL_LABEL,
  PHASE_LABEL,
  PROBABILITY_LABEL,
  PROBABILITY_COLOR,
} from '@/lib/constants';
import type {
  ContactRow,
  MeetingRow,
  DealWithContact,
  MeetingTool,
} from '@/types';

const tierOptions = [
  { value: '1', label: 'Tier 1 - 相互認知' },
  { value: '2', label: 'Tier 2 - 面識あり' },
  { value: '3', label: 'Tier 3 - 片面識' },
  { value: '4', label: 'Tier 4 - 不明' },
];

const MEETINGS_PAGE_SIZE = 20;

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [contact, setContact] = useState<ContactRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // editable fields
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tier, setTier] = useState('4');
  const [note, setNote] = useState('');

  // meetings
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [meetingsPage, setMeetingsPage] = useState(1);
  const [meetingsTotal, setMeetingsTotal] = useState(0);

  // deals
  const [deals, setDeals] = useState<DealWithContact[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);

  const fetchContact = useCallback(async () => {
    if (!id) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(`/api/contacts/${id}`, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(res.status === 404 ? 'コンタクトが見つかりませんでした' : 'データの取得に失敗しました');
      }
      const json: { data: ContactRow } = await res.json();
      const c = json.data;
      setContact(c);
      setFullName(c.full_name);
      setCompanyName(c.company_name ?? '');
      setDepartment(c.department ?? '');
      setPosition(c.position ?? '');
      setEmail(c.email ?? '');
      setPhone(c.phone ?? '');
      setTier(String(c.tier));
      setNote(c.note ?? '');
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

  const fetchMeetings = useCallback(async () => {
    if (!id) return;
    setMeetingsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('contact_id', id);
      params.set('page', String(meetingsPage));
      params.set('limit', String(MEETINGS_PAGE_SIZE));
      const res = await fetch(`/api/meetings?${params.toString()}`);
      if (!res.ok) return;
      const json: { data: MeetingRow[]; total?: number } = await res.json();
      setMeetings(json.data);
      setMeetingsTotal(json.total ?? json.data.length);
    } catch (e) {
      console.error('会議履歴の取得に失敗しました:', e);
    } finally {
      setMeetingsLoading(false);
    }
  }, [id, meetingsPage]);

  const fetchDeals = useCallback(async () => {
    if (!id) return;
    setDealsLoading(true);
    try {
      const res = await fetch(`/api/deals?contact_id=${id}`);
      if (!res.ok) return;
      const json: { data: DealWithContact[] } = await res.json();
      setDeals(json.data);
    } catch (e) {
      console.error('関連案件の取得に失敗しました:', e);
    } finally {
      setDealsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchContact();
    return () => { abortRef.current?.abort(); };
  }, [fetchContact]);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);
  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          company_name: companyName || null,
          department: department || null,
          position: position || null,
          email: email || null,
          phone: phone || null,
          tier: Number(tier),
          note: note || null,
        }),
      });
      const json: { error?: string | null } = await res.json();
      if (!res.ok || json.error) {
        const msg = json.error ?? '保存に失敗しました';
        setSaveMsg(msg);
        setTimeout(() => setSaveMsg(null), 3000);
      } else {
        setSaveMsg('保存しました');
        setTimeout(() => setSaveMsg(null), 3000);
        fetchContact();
      }
    } catch (e) {
      console.error('コンタクトの保存に失敗しました:', e);
      setSaveMsg('保存に失敗しました');
      setTimeout(() => setSaveMsg(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const meetingsTotalPages = Math.max(1, Math.ceil(meetingsTotal / MEETINGS_PAGE_SIZE));

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-64 w-full max-w-2xl" />
      </div>
    );
  }

  if (error || !contact) {
    return (
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
          <p className="text-sm">コンタクトが見つかりませんでした</p>
          <div className="mt-3 flex gap-2">
            <Link href="/contacts" className="text-sm text-accent hover:underline">
              一覧に戻る
            </Link>
            <Button variant="secondary" size="sm" onClick={fetchContact}>
              再試行
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* パンくず */}
      <nav className="flex items-center gap-1 text-sm text-text-secondary">
        <Link href="/contacts" className="hover:text-accent">
          コンタクト
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-text">{contact.full_name}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 左カラム: 基本情報編集 */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-text">基本情報</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="氏名"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
                <Input
                  label="会社名"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="部署"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
                <Input
                  label="役職"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="メールアドレス"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Input
                  label="電話番号"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <Select
                label="ティア"
                options={tierOptions}
                value={tier}
                onChange={(e) => setTier(e.target.value)}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text">メモ</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent resize-y"
                />
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={handleSave} loading={saving} disabled={saving}>
                  <Save className="h-4 w-4" />
                  保存
                </Button>
                {saveMsg && (
                  <span className={`text-sm ${saveMsg === '保存しました' ? 'text-green-500' : 'text-red-400'}`}>
                    {saveMsg}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 関連案件 */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-text">関連案件</h2>
            </CardHeader>
            <CardContent>
              {dealsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : deals.length === 0 ? (
                <p className="text-sm text-text-secondary py-4 text-center">関連案件はありません</p>
              ) : (
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeader>案件名</TableHeader>
                      <TableHeader>フェーズ</TableHeader>
                      <TableHeader>受注確率</TableHeader>
                      <TableHeader>制作物</TableHeader>
                      <TableHeader>報酬</TableHeader>
                      <TableHeader>次アクション日</TableHeader>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {deals.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <Link href={`/deals/${d.id}`} className="text-accent hover:underline font-medium">
                            {d.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="info">{PHASE_LABEL[d.phase]}</Badge>
                        </TableCell>
                        <TableCell>
                          {d.probability ? (
                            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${PROBABILITY_COLOR[d.probability]}`}>
                              {PROBABILITY_LABEL[d.probability]}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          <span className="truncate max-w-[150px] inline-block">{d.deliverable ?? '-'}</span>
                        </TableCell>
                        <TableCell>{d.revenue != null ? `${d.revenue.toLocaleString()}円` : '-'}</TableCell>
                        <TableCell>{d.next_action_date ?? '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 右カラム: 会議タイムライン */}
        <div>
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-text">会議履歴</h2>
            </CardHeader>
            <CardContent>
              {meetingsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : meetings.length === 0 ? (
                <p className="text-sm text-text-secondary py-4 text-center">会議記録はありません</p>
              ) : (
                <div className="space-y-3">
                  {meetings.map((m) => (
                    <Link
                      key={m.id}
                      href={`/meetings/${m.id}`}
                      className="block border border-border rounded-md p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-accent">
                          {new Date(m.meeting_date).toLocaleDateString('ja-JP')}
                        </span>
                        {m.tool && (
                          <Badge variant="info">{TOOL_LABEL[m.tool] ?? m.tool}</Badge>
                        )}
                      </div>
                      {m.participants.length > 0 && (
                        <p className="text-xs text-text-secondary mt-1 truncate">
                          {m.participants.join(', ')}
                        </p>
                      )}
                    </Link>
                  ))}
                  {meetingsTotalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={meetingsPage <= 1}
                        onClick={() => setMeetingsPage((p) => p - 1)}
                      >
                        前
                      </Button>
                      <span className="text-xs text-text-secondary">
                        {meetingsPage} / {meetingsTotalPages}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={meetingsPage >= meetingsTotalPages}
                        onClick={() => setMeetingsPage((p) => p + 1)}
                      >
                        次
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
