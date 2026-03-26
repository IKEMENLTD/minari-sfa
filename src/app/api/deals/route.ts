import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { DealWithDetails, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// GET /api/deals - 案件一覧
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse<ApiResult<DealWithDetails[]>>> {
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
      return NextResponse.json(
        { data: null, error: `案件一覧の取得に失敗しました: ${error.message}` },
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
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
    return NextResponse.json(
      { data: null, error: `案件一覧の取得中にエラーが発生しました: ${message}` },
      { status: 500 }
    );
  }
}
