import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { DealWithDetails, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const updateDealStatusSchema = z.object({
  current_phase_id: z.string().uuid().optional(),
  next_action: z.string().optional(),
  status_summary: z.string().optional(),
  last_meeting_date: z.string().date().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/deals/[id] - 案件詳細
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<DealWithDetails>>> {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('deal_statuses')
      .select(`
        *,
        companies (*),
        sales_phases:current_phase_id (*)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { data: null, error: '指定された案件が見つかりません' },
        { status: 404 }
      );
    }

    const deal: DealWithDetails = {
      deal_status: {
        id: data.id,
        company_id: data.company_id,
        current_phase_id: data.current_phase_id,
        next_action: data.next_action,
        status_summary: data.status_summary,
        last_meeting_date: data.last_meeting_date,
        updated_at: data.updated_at,
        created_at: data.created_at,
      },
      company: data.companies,
      phase: data.sales_phases,
    };

    return NextResponse.json({ data: deal, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
    return NextResponse.json(
      { data: null, error: `案件詳細の取得中にエラーが発生しました: ${message}` },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/deals/[id] - 案件ステータス手動更新
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<DealWithDetails>>> {
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const parsed = updateDealStatusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: `入力値が不正です: ${parsed.error.issues.map((e: { message: string }) => e.message).join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data: updated, error } = await supabase
      .from('deal_statuses')
      .update({
        ...parsed.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        companies (*),
        sales_phases:current_phase_id (*)
      `)
      .single();

    if (error || !updated) {
      return NextResponse.json(
        { data: null, error: `案件の更新に失敗しました: ${error?.message}` },
        { status: 500 }
      );
    }

    const deal: DealWithDetails = {
      deal_status: {
        id: updated.id,
        company_id: updated.company_id,
        current_phase_id: updated.current_phase_id,
        next_action: updated.next_action,
        status_summary: updated.status_summary,
        last_meeting_date: updated.last_meeting_date,
        updated_at: updated.updated_at,
        created_at: updated.created_at,
      },
      company: updated.companies,
      phase: updated.sales_phases,
    };

    return NextResponse.json({ data: deal, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
    return NextResponse.json(
      { data: null, error: `案件の更新中にエラーが発生しました: ${message}` },
      { status: 500 }
    );
  }
}
