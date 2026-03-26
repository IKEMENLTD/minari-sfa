import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth } from '@/lib/auth';
import type { DealWithDetails, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// GET /api/deals - 案件一覧
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse<ApiResult<DealWithDetails[]>>> {
  const authError = validateAuth(request);
  if (authError) return authError as NextResponse<ApiResult<DealWithDetails[]>>;

  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('deal_statuses')
      .select(`
        *,
        companies (*),
        sales_phases:current_phase_id (*)
      `)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('案件一覧の取得に失敗しました:', error.message);
      return NextResponse.json(
        { data: null, error: '案件一覧の取得に失敗しました' },
        { status: 500 }
      );
    }

    const deals: DealWithDetails[] = (data ?? []).map((row) => ({
      deal_status: {
        id: row.id,
        company_id: row.company_id,
        current_phase_id: row.current_phase_id,
        next_action: row.next_action,
        status_summary: row.status_summary,
        last_meeting_date: row.last_meeting_date,
        updated_at: row.updated_at,
        created_at: row.created_at,
      },
      company: row.companies,
      phase: row.sales_phases,
    }));

    return NextResponse.json({ data: deals, error: null });
  } catch (err) {
    console.error('案件一覧の取得中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '案件一覧の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
