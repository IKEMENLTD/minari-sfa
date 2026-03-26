import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth } from '@/lib/auth';
import type { CompanyRow, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// GET /api/companies - 企業一覧
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse<ApiResult<CompanyRow[]>>> {
  const authError = validateAuth(request);
  if (authError) return authError as NextResponse<ApiResult<CompanyRow[]>>;

  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('name', { ascending: true });

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
