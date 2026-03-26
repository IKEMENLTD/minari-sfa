import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { CompanyRow, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// GET /api/companies - 企業一覧
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse<ApiResult<CompanyRow[]>>> {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json(
        { data: null, error: `企業一覧の取得に失敗しました: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: (data ?? []) as CompanyRow[], error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
    return NextResponse.json(
      { data: null, error: `企業一覧の取得中にエラーが発生しました: ${message}` },
      { status: 500 }
    );
  }
}
