'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Save,
  Calendar,
} from 'lucide-react';
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
  DEAL_PHASES,
  PHASE_LABEL,
  PROBABILITY_LABEL,
  PROBABILITY_COLOR,
  TIER_LABEL,
  TOOL_LABEL,
  ACTION_DATE_SHORTCUTS,
} from '@/lib/constants';
import type {
  DealWithContact,
  DealPhase,
  DealProbability,
  DealTaxType,
  MeetingRow,
  ContactRow,
  MeetingTool,
} from '@/types';

interface MeetingWithContact extends MeetingRow {
  contact: ContactRow | null;
}

const phaseOptions = DEAL_PHASES.map((p) => ({ value: p.id, label: p.name }));
const probabilityOptions = [
  { value: '', label: '未設定' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
  { value: 'very_low', label: '極低' },
  { value: 'unknown', label: '不明' },
];

const taxTypeOptions = [
  { value: '', label: '未設定' },
  { value: 'included', label: '税込' },
  { value: 'excluded', label: '税抜' },
];

const MEETINGS_PAGE_SIZE = 20;

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [deal, setDeal] = useState<DealWithContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // UI state
  const [isDirty, setIsDirty] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // editable fields
  const [phase, setPhase] = useState<DealPhase>('proposal_planned');
  const [probability, setProbability] = useState<DealProbability | ''>('');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [note, setNote] = useState('');
  const [deliverable, setDeliverable] = useState('');
  const [industry, setIndustry] = useState('');
  const [deadline, setDeadline] = useState('');
  const [revenue, setRevenue] = useState('');
  const [targetCountry, setTargetCountry] = useState('');
  const [taxType, setTaxType] = useState<DealTaxType | ''>('');
  const [hasMovement, setHasMovement] = useState(false);
  const [statusDetail, setStatusDetail] = useState('');
  const [billingMonth, setBillingMonth] = useState('');
  const [clientContactName, setClientContactName] = useState('');
  const [revenueNote, setRevenueNote] = useState('');

  // meetings
  const [meetings, setMeetings] = useState<MeetingWithContact[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [meetingsPage, setMeetingsPage] = useState(1);
  const [meetingsTotal, setMeetingsTotal] = useState(0);

  const fetchDeal = useCallback(async () => {
    if (!id) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(`/api/deals/${id}`, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(res.status === 404 ? '案件が見つかりませんでした' : 'データの取得に失敗しました');
      }
      const json: { data: DealWithContact } = await res.json();
      const d = json.data;
      setDeal(d);
      setPhase(d.phase);
      setProbability(d.probability ?? '');
      setNextAction(d.next_action ?? '');
      setNextActionDate(d.next_action_date ?? '');
      setNote(d.note ?? '');
      setDeliverable(d.deliverable ?? '');
      setIndustry(d.industry ?? '');
      setDeadline(d.deadline ?? '');
      setRevenue(d.revenue != null ? String(d.revenue) : '');
      setTargetCountry(d.target_country ?? '');
      setTaxType((d.tax_type as DealTaxType | null) ?? '');
      setHasMovement(d.has_movement ?? false);
      setStatusDetail(d.status_detail ?? '');
      setBillingMonth(d.billing_month ?? '');
      setClientContactName(d.client_contact_name ?? '');
      setRevenueNote(d.revenue_note ?? '');
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
      params.set('deal_id', id);
      params.set('page', String(meetingsPage));
      params.set('limit', String(MEETINGS_PAGE_SIZE));
      const res = await fetch(`/api/meetings?${params.toString()}`);
      if (!res.ok) return;
      const json: { data: MeetingWithContact[]; total?: number } = await res.json();
      setMeetings(json.data);
      setMeetingsTotal(json.total ?? json.data.length);
    } catch (e) {
      console.error('関連会議の取得に失敗しました:', e);
    } finally {
      setMeetingsLoading(false);
    }
  }, [id, meetingsPage]);

  useEffect(() => {
    fetchDeal();
    return () => { abortRef.current?.abort(); };
  }, [fetchDeal]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  // 未保存警告
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/deals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase,
          probability: probability || null,
          next_action: nextAction || null,
          next_action_date: nextActionDate || null,
          note: note || null,
          deliverable: deliverable || null,
          industry: industry || null,
          deadline: deadline || null,
          revenue: revenue ? parseInt(revenue, 10) : null,
          target_country: targetCountry || null,
          tax_type: taxType || null,
          has_movement: hasMovement,
          status_detail: statusDetail || null,
          billing_month: billingMonth || null,
          client_contact_name: clientContactName || null,
          revenue_note: revenueNote || null,
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
        setIsDirty(false);
        fetchDeal();
      }
    } catch (e) {
      console.error('案件の保存に失敗しました:', e);
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

  if (error || !deal) {
    return (
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
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
      {/* パンくず */}
      <nav className="flex items-center gap-1 text-sm text-text-secondary">
        <Link href="/deals" className="hover:text-accent">
          案件ボード
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-text">{deal.title}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 左カラム: コンタクト情報 + フォーム */}
        <div className="lg:col-span-2 space-y-6">
          {/* コンタクト情報 */}
          {deal.contact && (
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-text">コンタクト情報</h2>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <Link href={`/contacts/${deal.contact.id}`} className="text-accent hover:underline font-medium">
                    {deal.contact.full_name}
                  </Link>
                  <Badge variant="info">{TIER_LABEL[deal.contact.tier] ?? `Tier ${deal.contact.tier}`}</Badge>
                </div>
                {deal.contact.company_name && (
                  <p className="text-sm text-text-secondary">{deal.contact.company_name}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* 基本情報（常に表示） */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-text">基本情報</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="フェーズ"
                  options={phaseOptions}
                  value={phase}
                  onChange={(e) => { setPhase(e.target.value as DealPhase); setIsDirty(true); }}
                />
                <Select
                  label="受注確率"
                  options={probabilityOptions}
                  value={probability}
                  onChange={(e) => { setProbability(e.target.value as DealProbability | ''); setIsDirty(true); }}
                />
              </div>

              <Input
                label="次アクション"
                value={nextAction}
                onChange={(e) => { setNextAction(e.target.value); setIsDirty(true); }}
                placeholder="次にやること"
              />

              <div>
                <Input
                  label="次アクション日"
                  type="date"
                  value={nextActionDate}
                  onChange={(e) => { setNextActionDate(e.target.value); setIsDirty(true); }}
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {ACTION_DATE_SHORTCUTS.map((s) => (
                    <button
                      key={s.days}
                      type="button"
                      onClick={() => { setNextActionDate(addDays(s.days)); setIsDirty(true); }}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-secondary hover:bg-muted transition-colors"
                    >
                      <Calendar className="h-3 w-3" />
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text">メモ</label>
                <textarea
                  value={note}
                  onChange={(e) => { setNote(e.target.value); setIsDirty(true); }}
                  rows={4}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent resize-y"
                  placeholder="メモ"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="has_movement"
                  checked={hasMovement}
                  onChange={(e) => { setHasMovement(e.target.checked); setIsDirty(true); }}
                  className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-accent/50"
                />
                <label htmlFor="has_movement" className="text-sm font-medium text-text">
                  動きあり
                </label>
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

          {/* 詳細情報（折りたたみ、デフォルト閉じ） */}
          <Card>
            <CardHeader>
              <button
                type="button"
                onClick={() => setDetailsOpen(!detailsOpen)}
                className="flex items-center justify-between w-full text-left"
              >
                <h2 className="text-sm font-semibold text-text">詳細情報</h2>
                {detailsOpen ? (
                  <ChevronUp className="h-4 w-4 text-text-secondary" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-text-secondary" />
                )}
              </button>
            </CardHeader>
            {detailsOpen && (
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="制作物"
                    value={deliverable}
                    onChange={(e) => { setDeliverable(e.target.value); setIsDirty(true); }}
                    placeholder="制作物/制作物想定"
                  />
                  <Input
                    label="職種・内容"
                    value={industry}
                    onChange={(e) => { setIndustry(e.target.value); setIsDirty(true); }}
                    placeholder="職種、内容"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="クライアント窓口"
                    value={clientContactName}
                    onChange={(e) => { setClientContactName(e.target.value); setIsDirty(true); }}
                    placeholder="先方の担当者名"
                  />
                  <Input
                    label="納期"
                    type="text"
                    value={deadline}
                    onChange={(e) => { setDeadline(e.target.value); setIsDirty(true); }}
                    placeholder="例: ~11月末、2026-12-31"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-text">報酬</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={revenue}
                        onChange={(e) => { setRevenue(e.target.value); setIsDirty(true); }}
                        placeholder="0"
                        className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                      />
                      <span className="text-sm text-text-secondary">円</span>
                    </div>
                  </div>
                  <Input
                    label="金額メモ"
                    value={revenueNote}
                    onChange={(e) => { setRevenueNote(e.target.value); setIsDirty(true); }}
                    placeholder="例: 金額未定、要相談"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="対象国"
                    value={targetCountry}
                    onChange={(e) => { setTargetCountry(e.target.value); setIsDirty(true); }}
                    placeholder="日本"
                  />
                  <Select
                    label="税込/税抜"
                    options={taxTypeOptions}
                    value={taxType}
                    onChange={(e) => { setTaxType(e.target.value as DealTaxType | ''); setIsDirty(true); }}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="請求書受領月"
                    value={billingMonth}
                    onChange={(e) => { setBillingMonth(e.target.value); setIsDirty(true); }}
                    placeholder="例: 2026-04"
                  />
                  <Input
                    label="詳細ステータス"
                    value={statusDetail}
                    onChange={(e) => { setStatusDetail(e.target.value); setIsDirty(true); }}
                    placeholder="自由記述"
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
            )}
          </Card>
        </div>

        {/* 右カラム: 関連会議タイムライン */}
        <div>
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-text">関連会議</h2>
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
                      {m.contact && (
                        <p className="text-xs text-text-secondary mt-1">{m.contact.full_name}</p>
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
