import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth } from '@/lib/auth';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';
import type { CompanyRow, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// GET /api/companies - 企業一覧
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse<ApiResult<CompanyRow[]>>> {
  const authResult = await validateAuth(request);
  if (authResult instanceof NextResponse) return authResult as NextResponse<ApiResult<CompanyRow[]>>;

  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
    const offset = (page - 1) * limit;

    const { data, error } = await supabase
      .from('companies')
      .select('id, name, tier, expected_revenue, sku_count, assigned_to, created_at, updated_at')
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('企業一覧の取得に失敗しました:', error.message);
      return NextResponse.json(
        { data: null, error: '企業一覧の取得に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: (data ?? []) as CompanyRow[], error: null });
  } catch (err) {
    console.error('企業一覧の取得中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '企業一覧の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
