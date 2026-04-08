'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Plus, X, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
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
import { TIER_LABEL } from '@/lib/constants';
import type { ContactRow } from '@/types';

type TierFilter = '' | '1' | '2' | '3' | '4';

const TIER_TABS: { value: TierFilter; label: string }[] = [
  { value: '', label: '全て' },
  { value: '1', label: 'Tier 1' },
  { value: '2', label: 'Tier 2' },
  { value: '3', label: 'Tier 3' },
  { value: '4', label: 'Tier 4' },
];

const PAGE_SIZE = 50;

const tierOptions = [
  { value: '1', label: 'Tier 1 - 相互認知' },
  { value: '2', label: 'Tier 2 - 面識あり' },
  { value: '3', label: 'Tier 3 - 片面識' },
  { value: '4', label: 'Tier 4 - 不明' },
];

const sourceOptions = [
  { value: 'manual', label: '手動' },
  { value: 'eight', label: 'Eight' },
  { value: 'tldv', label: 'tl;dv' },
];

interface CreateFormData {
  full_name: string;
  company_name: string;
  department: string;
  position: string;
  email: string;
  phone: string;
  tier: string;
  source: string;
  note: string;
}

const initialForm: CreateFormData = {
  full_name: '',
  company_name: '',
  department: '',
  position: '',
  email: '',
  phone: '',
  tier: '4',
  source: 'manual',
  note: '',
};

function ContactsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [tier, setTier] = useState<TierFilter>(
    (searchParams.get('tier') as TierFilter) ?? '',
  );
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') ?? '');
  const [page, setPage] = useState(Number(searchParams.get('page') ?? '1'));
  const [assignedToFilter, setAssignedToFilter] = useState('');
  const [assignedToOptions, setAssignedToOptions] = useState<{ value: string; label: string }[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // modal
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<CreateFormData>(initialForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchContacts = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const params = new URLSearchParams();
      if (tier) params.set('tier', tier);
      if (searchQuery) params.set('search', searchQuery);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));

      const res = await fetch(`/api/contacts?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('データの取得に失敗しました');
      const json: { data: ContactRow[]; total?: number } = await res.json();

      // 担当者一覧を抽出
      const uniqueAssignees = Array.from(
        new Set(json.data.map((c) => c.assigned_to).filter(Boolean))
      ).sort();
      setAssignedToOptions(
        uniqueAssignees.map((name) => ({ value: name, label: name }))
      );

      // クライアントサイドフィルタ: 担当者
      const filtered = assignedToFilter
        ? json.data.filter((c) => c.assigned_to === assignedToFilter)
        : json.data;

      setContacts(filtered);
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
  }, [tier, searchQuery, page, assignedToFilter]);

  useEffect(() => {
    fetchContacts();
    return () => { abortRef.current?.abort(); };
  }, [fetchContacts]);

  // Escキーでモーダル閉じ
  useEffect(() => {
    if (!showModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowModal(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showModal]);

  const updateUrl = (newTier: TierFilter, newSearch: string, newPage: number) => {
    const params = new URLSearchParams();
    if (newTier) params.set('tier', newTier);
    if (newSearch) params.set('search', newSearch);
    if (newPage > 1) params.set('page', String(newPage));
    router.replace(`/contacts?${params.toString()}`);
  };

  const handleTierChange = (value: TierFilter) => {
    setTier(value);
    setPage(1);
    updateUrl(value, searchQuery, 1);
  };

  const handleSearch = () => {
    setPage(1);
    updateUrl(tier, searchQuery, 1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    updateUrl(tier, searchQuery, newPage);
  };

  const handleCreate = async () => {
    if (!form.full_name.trim()) {
      setCreateError('氏名は必須です');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name,
          company_name: form.company_name || null,
          department: form.department || null,
          position: form.position || null,
          email: form.email || null,
          phone: form.phone || null,
          tier: Number(form.tier),
          source: form.source,
          note: form.note || null,
        }),
      });
      const json: { error?: string | null } = await res.json();
      if (!res.ok || json.error) {
        setCreateError(json.error ?? '作成に失敗しました');
      } else {
        setShowModal(false);
        setForm(initialForm);
        fetchContacts();
      }
    } catch {
      setCreateError('作成に失敗しました');
    } finally {
      setCreating(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text">コンタクト</h1>
        <Button size="sm" onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4" />
          コンタクト追加
        </Button>
      </div>

      {/* 検索 + 担当者フィルター */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 flex-1">
          <div className="flex-1 max-w-xs">
            <Input
              placeholder="氏名・会社名で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <Button variant="secondary" size="sm" onClick={handleSearch}>
            <Search className="h-4 w-4" />
          </Button>
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

      {/* ティアタブ */}
      <div className="flex flex-wrap gap-2">
        {TIER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => handleTierChange(tab.value)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
              tier === tab.value
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
            <Button variant="secondary" size="sm" onClick={fetchContacts}>
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
      ) : contacts.length === 0 ? (
        <div className="py-16 text-center text-sm text-text-secondary space-y-3">
          <p>コンタクトがまだありません。最初のコンタクトを登録しましょう</p>
          <Button size="sm" onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4" />
            コンタクトを追加
          </Button>
        </div>
      ) : (
        <>
          {/* モバイル */}
          <div className="sm:hidden space-y-2">
            {contacts.map((c) => (
              <Link
                key={c.id}
                href={`/contacts/${c.id}`}
                className="block border border-border bg-surface p-3 hover:bg-muted/50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-accent">{c.full_name}</span>
                  <Badge variant="info">{TIER_LABEL[c.tier] ?? `Tier ${c.tier}`}</Badge>
                </div>
                <p className="text-xs text-text-secondary">{c.company_name ?? '-'}</p>
              </Link>
            ))}
          </div>

          {/* デスクトップ */}
          <div className="hidden sm:block">
            <Card>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeader>氏名</TableHeader>
                    <TableHeader>会社名</TableHeader>
                    <TableHeader>部署/役職</TableHeader>
                    <TableHeader>ティア</TableHeader>
                    <TableHeader>担当者</TableHeader>
                    <TableHeader>登録日</TableHeader>
                  </tr>
                </TableHead>
                <TableBody>
                  {contacts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link href={`/contacts/${c.id}`} className="text-accent hover:underline font-medium">
                          {c.full_name}
                        </Link>
                      </TableCell>
                      <TableCell>{c.company_name ?? '-'}</TableCell>
                      <TableCell>
                        <span className="text-sm text-text">
                          {[c.department, c.position].filter(Boolean).join(' / ') || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="info">{TIER_LABEL[c.tier] ?? `Tier ${c.tier}`}</Badge>
                      </TableCell>
                      <TableCell>{c.assigned_to ?? '-'}</TableCell>
                      <TableCell>
                        {new Date(c.created_at).toLocaleDateString('ja-JP')}
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

      {/* 新規作成モーダル */}
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
                <h2 className="text-base font-semibold text-text">コンタクト追加</h2>
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
                  <Input
                    label="氏名 *"
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    placeholder="山田 太郎"
                  />
                  <Input
                    label="会社名"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="部署"
                      value={form.department}
                      onChange={(e) => setForm({ ...form, department: e.target.value })}
                    />
                    <Input
                      label="役職"
                      value={form.position}
                      onChange={(e) => setForm({ ...form, position: e.target.value })}
                    />
                  </div>
                  <Input
                    label="メールアドレス"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                  <Input
                    label="電話番号"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                  <Select
                    label="ティア"
                    options={tierOptions}
                    value={form.tier}
                    onChange={(e) => setForm({ ...form, tier: e.target.value })}
                  />
                  <Select
                    label="ソース"
                    options={sourceOptions}
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                  />
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-text">メモ</label>
                    <textarea
                      value={form.note}
                      onChange={(e) => setForm({ ...form, note: e.target.value })}
                      rows={3}
                      className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent resize-y"
                    />
                  </div>
                </div>
                <div className="border-t border-border px-5 py-3 flex items-center justify-end gap-2">
                  <Button variant="secondary" size="sm" type="button" onClick={() => setShowModal(false)}>
                    キャンセル
                  </Button>
                  <Button size="sm" type="submit" loading={creating} disabled={creating}>
                    作成
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

export default function ContactsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <h1 className="text-xl font-semibold text-text">コンタクト</h1>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      }
    >
      <ContactsContent />
    </Suspense>
  );
}
