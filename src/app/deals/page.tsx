'use client';

import { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { DealList } from '@/components/deals/deal-list';
import { Input } from '@/components/ui/input';
import { SkeletonTableRow } from '@/components/ui/skeleton';
import { Table, TableHead, TableBody, TableHeader } from '@/components/ui/table';
import type { DealWithDetails } from '@/types';

export default function DealsPage() {
  const [deals, setDeals] = useState<DealWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchDeals = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/deals');
        if (!res.ok) throw new Error('データの取得に失敗しました');
        const json: { data: DealWithDetails[] } = await res.json();
        setDeals(json.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'エラーが発生しました');
      } finally {
        setLoading(false);
      }
    };
    fetchDeals();
  }, []);

  const filtered = deals.filter((d) =>
    (d.company?.name ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-text">案件管理</h1>
        <div className="w-64">
          <Input
            placeholder="企業名で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <Table>
          <TableHead>
            <tr>
              <TableHeader>企業名</TableHeader>
              <TableHeader>フェーズ</TableHeader>
              <TableHeader>ネクストアクション</TableHeader>
              <TableHeader>最終商談日</TableHeader>
              <TableHeader>担当者</TableHeader>
            </tr>
          </TableHead>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonTableRow key={i} columns={5} />
            ))}
          </TableBody>
        </Table>
      ) : (
        <DealList deals={filtered} />
      )}
    </div>
  );
}
