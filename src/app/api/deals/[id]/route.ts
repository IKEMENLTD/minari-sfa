import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, validateContentType, requireRole, isAuthError } from '@/lib/auth';
import type { DealWithDetails, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

const updateDealStatusSchema = z.object({
  current_phase_id: z.string().uuid().optional(),
  next_action: z.string().max(500).optional(),
  status_summary: z.string().max(2000).optional(),
  last_meeting_date: z.string().date().optional(),
}).strict();

// ---------------------------------------------------------------------------
// GET /api/deals/[id] - 案件詳細
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<DealWithDetails>>> {
  const authResult = await validateAuth(request);
  if (authResult instanceof NextResponse) return authResult as NextResponse<ApiResult<DealWithDetails>>;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json(
        { data: null, error: '無効なIDフォーマットです' },
        { status: 400 }
      );
    }
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('deal_statuses')
      .select(`
        id, company_id, current_phase_id, next_action, status_summary, last_meeting_date, updated_at, created_at,
        companies (id, name, tier, expected_revenue, sku_count, assigned_to, created_at, updated_at),
        sales_phases:current_phase_id (id, phase_name, phase_order, description, created_at)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { data: null, error: '指定された案件が見つかりません' },
        { status: 404 }
      );
    }

    const company = Array.isArray(data.companies) ? data.companies[0] : data.companies;
    const phase = Array.isArray(data.sales_phases) ? data.sales_phases[0] : data.sales_phases;

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
      company: company as DealWithDetails['company'],
      phase: phase as DealWithDetails['phase'],
    };

    return NextResponse.json({ data: deal, error: null });
  } catch (err) {
    console.error('案件詳細の取得中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '案件詳細の取得中にエラーが発生しました' },
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
  const contentTypeError = validateContentType(request);
  if (contentTypeError) return contentTypeError as NextResponse<ApiResult<DealWithDetails>>;

  const authResult2 = await validateAuth(request);
  if (isAuthError(authResult2)) return authResult2 as NextResponse<ApiResult<DealWithDetails>>;

  // ロールチェック: admin または manager のみ案件更新可能
  const roleError = requireRole(authResult2, ['admin', 'manager']);
  if (roleError) return roleError as NextResponse<ApiResult<DealWithDetails>>;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json(
        { data: null, error: '無効なIDフォーマットです' },
        { status: 400 }
      );
    }
    const body: unknown = await request.json();
    const parsed = updateDealStatusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: `入力値が不正です: ${parsed.error.issues.map((e: { message: string }) => e.message).join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Prototype Pollution 防止: zodでバリデーション済みのプロパティのみ明示的に展開
    const { current_phase_id, next_action, status_summary, last_meeting_date } = parsed.data;
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (current_phase_id !== undefined) updateData.current_phase_id = current_phase_id;
    if (next_action !== undefined) updateData.next_action = next_action;
    if (status_summary !== undefined) updateData.status_summary = status_summary;
    if (last_meeting_date !== undefined) updateData.last_meeting_date = last_meeting_date;

    const { data: updated, error } = await supabase
      .from('deal_statuses')
      .update(updateData)
      .eq('id', id)
      .select(`
        id, company_id, current_phase_id, next_action, status_summary, last_meeting_date, updated_at, created_at,
        companies (id, name, tier, expected_revenue, sku_count, assigned_to, created_at, updated_at),
        sales_phases:current_phase_id (id, phase_name, phase_order, description, created_at)
      `)
      .single();

    if (error || !updated) {
      console.error('案件の更新に失敗しました:', error?.message);
      return NextResponse.json(
        { data: null, error: '案件の更新に失敗しました' },
        { status: 500 }
      );
    }

    const updatedCompany = Array.isArray(updated.companies) ? updated.companies[0] : updated.companies;
    const updatedPhase = Array.isArray(updated.sales_phases) ? updated.sales_phases[0] : updated.sales_phases;

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
      company: updatedCompany as DealWithDetails['company'],
      phase: updatedPhase as DealWithDetails['phase'],
    };

    return NextResponse.json({ data: deal, error: null });
  } catch (err) {
    console.error('案件の更新中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '案件の更新中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
