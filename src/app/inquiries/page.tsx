'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Plus, X, Pencil } from 'lucide-react';
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
  INQUIRY_SOURCE_LABEL,
  INQUIRY_STATUS_LABEL,
} from '@/lib/constants';
import type { InquiryRow, InquiryStatus, ContactRow } from '@/types';
import type { BadgeVariant } from '@/components/ui/badge';

type StatusFilter = '' | InquiryStatus;
type SourceFilter = '' | 'website' | 'phone' | 'other';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: '', label: '全て' },
  { value: 'new', label: '未対応' },
  { value: 'in_progress', label: '対応中' },
  { value: 'completed', label: '完了' },
];

const SOURCE_TABS: { value: SourceFilter; label: string }[] = [
  { value: '', label: '全ソース' },
  { value: 'website', label: 'HP' },
  { value: 'phone', label: '電話' },
  { value: 'other', label: 'その他' },
];

const PAGE_SIZE = 100;

const statusBadgeVariant: Record<string, BadgeVariant> = {
  new: 'danger',
  in_progress: 'warning',
  completed: 'success',
};

const sourceOptions = [
  { value: 'website', label: 'HP' },
  { value: 'phone', label: '電話' },
  { value: 'other', label: 'その他' },
];

interface MonthlySummary {
  month: string;
  website: number;
  phone: number;
  other: number;
  total: number;
}

interface InquiriesData {
  inquiries: InquiryRow[];
  total: number;
  monthlySummary: MonthlySummary[];
}

function InquiriesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([]);

  const [status, setStatus] = useState<StatusFilter>(
    (searchParams.get('status') as StatusFilter) ?? '',
  );
  const [source, setSource] = useState<SourceFilter>(
    (searchParams.get('source') as SourceFilter) ?? '',
  );
  const [page, setPage] = useState(Number(searchParams.get('page') ?? '1'));
  const abortRef = useRef<AbortController | null>(null);

  // month filter
  const [selectedMonth, setSelectedMonth] = useState('');

  // modal (create)
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formSource, setFormSource] = useState<'website' | 'phone' | 'other'>('website');
  const [formName, setFormName] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formContactId, setFormContactId] = useState('');

  // contacts for linking
  const [contactOptions, setContactOptions] = useState<{ value: string; label: string }[]>([]);

  // edit modal
  const [editTarget, setEditTarget] = useState<InquiryRow | null>(null);
  const [editStatus, setEditStatus] = useState<InquiryStatus>('new');
  const [editNote, setEditNote] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // クイック変更の連打防止
  const [quickChangingIds, setQuickChangingIds] = useState<Set<string>>(new Set());

  const fetchInquiries = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (source) params.set('source', source);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));

      const res = await fetch(`/api/inquiries?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('データの取得に失敗しました');
      const json: { data: InquiryRow[] | InquiriesData; total?: number; monthlySummary?: MonthlySummary[] } = await res.json();

      // APIレスポンス形式に柔軟対応
      if (Array.isArray(json.data)) {
        setInquiries(json.data);
        setTotal(json.total ?? json.data.length);
        setMonthlySummary(json.monthlySummary ?? []);
      } else {
        setInquiries(json.data.inquiries);
        setTotal(json.data.total);
        setMonthlySummary(json.data.monthlySummary ?? []);
      }
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
  }, [status, source, page]);

  useEffect(() => {
    fetchInquiries();
    return () => { abortRef.current?.abort(); };
  }, [fetchInquiries]);

  // Escキーでモーダル閉じ
  useEffect(() => {
    if (!showModal && !editTarget) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editTarget) setEditTarget(null);
        else if (showModal) setShowModal(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showModal, editTarget]);

  // コンタクト一覧を取得（紐付け用）
  const fetchContactOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts?limit=500');
      if (res.ok) {
        const json: { data: ContactRow[] } = await res.json();
        setContactOptions(json.data.map((c) => ({
          value: c.id,
          label: `${c.full_name}${c.company_name ? ` (${c.company_name})` : ''}`,
        })));
      }
    } catch (e) {
      console.error('コンタクト一覧の取得に失敗しました:', e);
    }
  }, []);

  useEffect(() => {
    fetchContactOptions();
  }, [fetchContactOptions]);

  const openEditModal = (inq: InquiryRow) => {
    setEditTarget(inq);
    setEditStatus(inq.status);
    setEditNote(inq.note ?? '');
    setEditError(null);
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/inquiries/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: editStatus,
          note: editNote || null,
        }),
      });
      const json: { error?: string | null } = await res.json();
      if (!res.ok || json.error) {
        setEditError(json.error ?? '更新に失敗しました');
      } else {
        setEditTarget(null);
        fetchInquiries();
      }
    } catch {
      setEditError('更新に失敗しました');
    } finally {
      setEditSaving(false);
    }
  };

  const handleStatusQuickChange = async (inq: InquiryRow, newStatus: InquiryStatus) => {
    if (quickChangingIds.has(inq.id)) return;
    setQuickChangingIds((prev) => new Set(prev).add(inq.id));
    try {
      const res = await fetch(`/api/inquiries/${inq.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchInquiries();
      }
    } catch (e) {
      console.error('ステータス変更に失敗しました:', e);
    } finally {
      setQuickChangingIds((prev) => {
        const next = new Set(prev);
        next.delete(inq.id);
        return next;
      });
    }
  };

  // 月選択によるフィルタリング済み集計
  const filteredMonthlySummary = selectedMonth
    ? monthlySummary.filter((m) => m.month === selectedMonth)
    : monthlySummary.slice(0, 2);

  const updateUrl = (newStatus: StatusFilter, newSource: SourceFilter, newPage: number) => {
    const params = new URLSearchParams();
    if (newStatus) params.set('status', newStatus);
    if (newSource) params.set('source', newSource);
    if (newPage > 1) params.set('page', String(newPage));
    router.replace(`/inquiries?${params.toString()}`);
  };

  const handleStatusChange = (value: StatusFilter) => {
    setStatus(value);
    setPage(1);
    updateUrl(value, source, 1);
  };

  const handleSourceChange = (value: SourceFilter) => {
    setSource(value);
    setPage(1);
    updateUrl(status, value, 1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    updateUrl(status, source, newPage);
  };

  const handleCreate = async () => {
    if (!formName.trim()) {
      setCreateError('問い合わせ者名は必須です');
      return;
    }
    if (!formContent.trim()) {
      setCreateError('内容は必須です');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: formSource,
          contact_name: formName,
          company_name: formCompany || null,
          contact_id: formContactId || null,
          content: formContent,
          note: formNote || null,
        }),
      });
      const json: { error?: string | null } = await res.json();
      if (!res.ok || json.error) {
        setCreateError(json.error ?? '登録に失敗しました');
      } else {
        setShowModal(false);
        setFormName('');
        setFormCompany('');
        setFormContent('');
        setFormNote('');
        setFormContactId('');
        setFormSource('website');
        fetchInquiries();
      }
    } catch {
      setCreateError('登録に失敗しました');
    } finally {
      setCreating(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text">問い合わせ</h1>
        <Button size="sm" onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4" />
          新規登録
        </Button>
      </div>

      {/* 月別集計カード */}
      {monthlySummary.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-text">月別集計</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
            />
            {selectedMonth && (
              <button
                type="button"
                onClick={() => setSelectedMonth('')}
                className="text-xs text-text-secondary hover:text-text"
              >
                リセット
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMonthlySummary.map((m) => (
              <Card key={m.month}>
                <CardContent className="py-4">
                  <p className="text-xs font-medium text-text-secondary mb-2">{m.month}</p>
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-xl font-semibold text-text">{m.total}件</p>
                    </div>
                    <div className="flex gap-3 text-xs text-text-secondary">
                      <span>HP: {m.website}</span>
                      <span>電話: {m.phone}</span>
                      <span>他: {m.other}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredMonthlySummary.length === 0 && (
              <p className="text-sm text-text-secondary">該当月のデータはありません</p>
            )}
          </div>
        </div>
      )}

      {/* ステータスタブ */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => handleStatusChange(tab.value)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
              status === tab.value
                ? 'bg-accent/20 text-accent border-accent/30'
                : 'bg-surface text-text-secondary border-border hover:bg-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <div className="border-l border-border mx-1" />
        {SOURCE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => handleSourceChange(tab.value)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
              source === tab.value
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
            <Button variant="secondary" size="sm" onClick={fetchInquiries}>
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
      ) : inquiries.length === 0 ? (
        <div className="py-16 text-center text-sm text-text-secondary space-y-3">
          <p>問い合わせがまだありません</p>
          <Button size="sm" onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4" />
            新規登録
          </Button>
        </div>
      ) : (
        <>
          {/* モバイル */}
          <div className="sm:hidden space-y-2">
            {inquiries.map((inq) => (
              <div
                key={inq.id}
                className="border border-border bg-surface p-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-text-secondary">
                    {new Date(inq.created_at).toLocaleDateString('ja-JP')}
                  </span>
                  <div className="flex items-center gap-1">
                    <Badge variant={statusBadgeVariant[inq.status] ?? 'default'}>
                      {INQUIRY_STATUS_LABEL[inq.status] ?? inq.status}
                    </Badge>
                    <Badge variant="info">
                      {INQUIRY_SOURCE_LABEL[inq.source] ?? inq.source}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm font-medium text-text">{inq.contact_name}</p>
                {inq.company_name && (
                  <p className="text-xs text-text-secondary">{inq.company_name}</p>
                )}
                <p className="text-xs text-text-secondary mt-1 truncate">{inq.content}</p>
                <div className="flex items-center gap-2 mt-2">
                  {inq.status !== 'completed' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={quickChangingIds.has(inq.id)}
                      onClick={() =>
                        handleStatusQuickChange(
                          inq,
                          inq.status === 'new' ? 'in_progress' : 'completed'
                        )
                      }
                    >
                      {inq.status === 'new' ? '対応開始' : '完了'}
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEditModal(inq)}
                    className="p-1.5 text-text-secondary hover:text-accent transition-colors"
                    title="編集"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* デスクトップ */}
          <div className="hidden sm:block">
            <Card>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeader>受付日</TableHeader>
                    <TableHeader>問い合わせ者名</TableHeader>
                    <TableHeader>会社名</TableHeader>
                    <TableHeader>ソース</TableHeader>
                    <TableHeader>ステータス</TableHeader>
                    <TableHeader>対応者</TableHeader>
                    <TableHeader>操作</TableHeader>
                  </tr>
                </TableHead>
                <TableBody>
                  {inquiries.map((inq) => (
                    <TableRow key={inq.id}>
                      <TableCell>
                        {new Date(inq.created_at).toLocaleDateString('ja-JP')}
                      </TableCell>
                      <TableCell className="font-medium">{inq.contact_name}</TableCell>
                      <TableCell>{inq.company_name ?? '-'}</TableCell>
                      <TableCell>
                        <Badge variant="info">
                          {INQUIRY_SOURCE_LABEL[inq.source] ?? inq.source}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant[inq.status] ?? 'default'}>
                          {INQUIRY_STATUS_LABEL[inq.status] ?? inq.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{inq.assigned_to ?? '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {inq.status !== 'completed' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={quickChangingIds.has(inq.id)}
                              onClick={() =>
                                handleStatusQuickChange(
                                  inq,
                                  inq.status === 'new' ? 'in_progress' : 'completed'
                                )
                              }
                            >
                              {inq.status === 'new' ? '対応開始' : '完了'}
                            </Button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(inq)}
                            className="p-1.5 text-text-secondary hover:text-accent transition-colors"
                            title="編集"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>
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

      {/* 編集モーダル */}
      {editTarget && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setEditTarget(null)}
            aria-hidden="true"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-surface border border-border rounded-md max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="text-base font-semibold text-text">問い合わせ編集</h2>
                <button type="button" onClick={() => setEditTarget(null)} className="text-text-secondary hover:text-text">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); handleEditSave(); }}>
                <div className="px-5 py-4 space-y-4">
                  {editError && (
                    <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {editError}
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-text-secondary">問い合わせ者</p>
                    <p className="text-sm font-medium text-text">{editTarget.contact_name}</p>
                  </div>
                  <Select
                    label="ステータス"
                    options={[
                      { value: 'new', label: '未対応' },
                      { value: 'in_progress', label: '対応中' },
                      { value: 'completed', label: '完了' },
                    ]}
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as InquiryStatus)}
                  />
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-text">メモ</label>
                    <textarea
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      rows={3}
                      className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent resize-y"
                    />
                  </div>
                </div>
                <div className="border-t border-border px-5 py-3 flex items-center justify-end gap-2">
                  <Button variant="secondary" size="sm" type="button" onClick={() => setEditTarget(null)}>
                    キャンセル
                  </Button>
                  <Button size="sm" type="submit" loading={editSaving} disabled={editSaving}>
                    保存
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* 新規登録モーダル */}
      {showModal && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setShowModal(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-surface border border-border rounded-md max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="text-base font-semibold text-text">問い合わせ登録</h2>
                <button type="button" onClick={() => setShowModal(false)} className="text-text-secondary hover:text-text">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
                <div className="px-5 py-4 space-y-4">
                  {createError && (
                    <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {createError}
                    </div>
                  )}
                  <Select
                    label="ソース *"
                    options={sourceOptions}
                    value={formSource}
                    onChange={(e) => setFormSource(e.target.value as 'website' | 'phone' | 'other')}
                  />
                  <Input
                    label="問い合わせ者名 *"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="山田 太郎"
                  />
                  <Input
                    label="会社名"
                    value={formCompany}
                    onChange={(e) => setFormCompany(e.target.value)}
                  />
                  {contactOptions.length > 0 && (
                    <Select
                      label="コンタクト紐付け"
                      options={contactOptions}
                      value={formContactId}
                      onChange={(e) => setFormContactId(e.target.value)}
                      placeholder="紐付けなし"
                    />
                  )}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-text">内容 *</label>
                    <textarea
                      value={formContent}
                      onChange={(e) => setFormContent(e.target.value)}
                      rows={4}
                      className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent resize-y"
                      placeholder="問い合わせ内容..."
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-text">メモ</label>
                    <textarea
                      value={formNote}
                      onChange={(e) => setFormNote(e.target.value)}
                      rows={2}
                      className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent resize-y"
                    />
                  </div>
                </div>
                <div className="border-t border-border px-5 py-3 flex items-center justify-end gap-2">
                  <Button variant="secondary" size="sm" type="button" onClick={() => setShowModal(false)}>
                    キャンセル
                  </Button>
                  <Button size="sm" type="submit" loading={creating} disabled={creating}>
                    登録
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function InquiriesPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <h1 className="text-xl font-semibold text-text">問い合わせ</h1>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      }
    >
      <InquiriesContent />
    </Suspense>
  );
}
