import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { SalesPhaseRow, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// GET /api/phases - 営業フェーズ一覧
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse<ApiResult<SalesPhaseRow[]>>> {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('sales_phases')
      .select('*')
      .order('phase_order', { ascending: true });

    if (error) {
      return NextResponse.json(
        { data: null, error: `フェーズ一覧の取得に失敗しました: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: (data ?? []) as SalesPhaseRow[], error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
    return NextResponse.json(
      { data: null, error: `フェーズ一覧の取得中にエラーが発生しました: ${message}` },
      { status: 500 }
    );
  }
}
