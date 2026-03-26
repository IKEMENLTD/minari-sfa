import Link from 'next/link';
import { headers } from 'next/headers';
import { ChevronRight } from 'lucide-react';
import { DealCard } from '@/components/deals/deal-card';
import type { DealWithDetails, SalesPhaseRow, ApiResult } from '@/types';

interface DealPageData {
  deal: DealWithDetails;
  phases: SalesPhaseRow[];
}

async function getDeal(id: string): Promise<DealPageData | null> {
  try {
    // NOTE: 本番環境では必ず NEXT_PUBLIC_BASE_URL を https:// で設定すること
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    // SSR 内部 fetch: クライアントの認証情報をそのまま転送する
    const headerStore = await headers();
    const authorization = headerStore.get('authorization') ?? '';
    const cookie = headerStore.get('cookie') ?? '';
    const fetchHeaders: Record<string, string> = {};
    if (authorization) fetchHeaders['Authorization'] = authorization;
    if (cookie) fetchHeaders['Cookie'] = cookie;

    const [dealRes, phasesRes] = await Promise.all([
      fetch(`${baseUrl}/api/deals/${id}`, { cache: 'no-store', headers: fetchHeaders }),
      fetch(`${baseUrl}/api/phases`, { cache: 'no-store', headers: fetchHeaders }),
    ]);
    if (!dealRes.ok || !phasesRes.ok) return null;
    const dealJson: ApiResult<DealWithDetails> = await dealRes.json();
    const phasesJson: ApiResult<SalesPhaseRow[]> = await phasesRes.json();
    if (dealJson.error !== null || phasesJson.error !== null) return null;
    return { deal: dealJson.data, phases: phasesJson.data };
  } catch {
    return null;
  }
}

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getDeal(id);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
        <p className="text-sm">案件が見つかりませんでした</p>
        <Link href="/deals" className="mt-3 text-sm text-accent hover:underline">
          一覧に戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* パンくず */}
      <nav className="flex items-center gap-1 text-sm text-text-secondary">
        <Link href="/deals" className="hover:text-accent">
          案件管理
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-text">{data.deal.company?.name ?? '未登録'}</span>
      </nav>

      <div className="max-w-xl">
        <DealCard deal={data.deal} allPhases={data.phases} />
      </div>
    </div>
  );
}
