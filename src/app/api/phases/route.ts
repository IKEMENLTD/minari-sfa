import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth } from '@/lib/auth';
import type { SalesPhaseRow, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// GET /api/phases - 営業フェーズ一覧
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse<ApiResult<SalesPhaseRow[]>>> {
  const authResult = await validateAuth(request);
  if (authResult instanceof NextResponse) return authResult as NextResponse<ApiResult<SalesPhaseRow[]>>;

  try {
    const supabase = createServerSupabaseClient();

    // フェーズ数は約30件で固定的だが、安全のため上限100件に制限
    const { data, error } = await supabase
      .from('sales_phases')
      .select('id, phase_name, phase_order, description, created_at')
      .order('phase_order', { ascending: true })
      .limit(100);

    if (error) {
      console.error('フェーズ一覧の取得に失敗しました:', error.message);
      return NextResponse.json(
        { data: null, error: 'フェーズ一覧の取得に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: (data ?? []) as SalesPhaseRow[], error: null });
  } catch (err) {
    console.error('フェーズ一覧の取得中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: 'フェーズ一覧の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
