import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, validateContentType, isAuthError } from '@/lib/auth';
import type { DealWithContact, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

const updateDealSchema = z.object({
  contact_id: z.string().uuid().optional(),
  title: z.string().min(1).max(500).optional(),
  phase: z.enum(['proposal_planned', 'proposal_active', 'waiting', 'follow_up', 'active']).optional(),
  probability: z.enum(['high', 'medium', 'low', 'very_low', 'unknown']).nullable().optional(),
  next_action: z.string().max(500).nullable().optional(),
  next_action_date: z.string().max(20).nullable().optional(),
  assigned_to: z.string().uuid().optional(),
  note: z.string().max(2000).nullable().optional(),
  deliverable: z.string().max(1000).nullable().optional(),
  industry: z.string().max(500).nullable().optional(),
  deadline: z.string().max(20).nullable().optional(),
  revenue: z.number().int().min(0, '報酬は0以上を指定してください').nullable().optional(),
  target_country: z.string().max(200).nullable().optional(),
  tax_type: z.enum(['included', 'excluded']).nullable().optional(),
  has_movement: z.boolean().optional(),
  status_detail: z.string().max(1000).nullable().optional(),
  billing_month: z.string().max(50).nullable().optional(),
  client_contact_name: z.string().max(200).nullable().optional(),
  revenue_note: z.string().max(1000).nullable().optional(),
}).strict();

// ---------------------------------------------------------------------------
// GET /api/deals/[id] - 案件詳細
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<DealWithContact>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<DealWithContact>>;

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
      .from('deals')
      .select('*, contact:contacts(*)')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { data: null, error: '指定された案件が見つかりません' },
        { status: 404 }
      );
    }

    const contact = Array.isArray(data.contact) ? data.contact[0] : data.contact;
    const deal: DealWithContact = {
      id: data.id,
      contact_id: data.contact_id,
      title: data.title,
      phase: data.phase,
      probability: data.probability,
      next_action: data.next_action,
      next_action_date: data.next_action_date,
      assigned_to: data.assigned_to,
      note: data.note,
      deliverable: data.deliverable ?? null,
      industry: data.industry ?? null,
      deadline: data.deadline ?? null,
      revenue: data.revenue ?? null,
      target_country: data.target_country ?? null,
      tax_type: data.tax_type ?? null,
      has_movement: data.has_movement ?? false,
      status_detail: data.status_detail ?? null,
      billing_month: data.billing_month ?? null,
      client_contact_name: data.client_contact_name ?? null,
      revenue_note: data.revenue_note ?? null,
      created_at: data.created_at,
      updated_at: data.updated_at,
      contact: contact ?? null,
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
// PATCH /api/deals/[id] - 案件更新
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<DealWithContact>>> {
  const contentTypeError = validateContentType(request);
  if (contentTypeError) return contentTypeError as NextResponse<ApiResult<DealWithContact>>;

  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<DealWithContact>>;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json(
        { data: null, error: '無効なIDフォーマットです' },
        { status: 400 }
      );
    }

    const body: unknown = await request.json();
    const parsed = updateDealSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: `入力値が不正です: ${parsed.error.issues.map((e) => e.message).join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const {
      contact_id, title, phase, probability, next_action, next_action_date,
      assigned_to, note, deliverable, industry, deadline, revenue,
      target_country, tax_type, has_movement, status_detail, billing_month,
      client_contact_name, revenue_note,
    } = parsed.data;
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (contact_id !== undefined) updateData.contact_id = contact_id;
    if (title !== undefined) updateData.title = title;
    if (phase !== undefined) updateData.phase = phase;
    if (probability !== undefined) updateData.probability = probability;
    if (next_action !== undefined) updateData.next_action = next_action;
    if (next_action_date !== undefined) updateData.next_action_date = next_action_date;
    if (assigned_to !== undefined) updateData.assigned_to = assigned_to;
    if (note !== undefined) updateData.note = note;
    if (deliverable !== undefined) updateData.deliverable = deliverable;
    if (industry !== undefined) updateData.industry = industry;
    if (deadline !== undefined) updateData.deadline = deadline;
    if (revenue !== undefined) updateData.revenue = revenue;
    if (target_country !== undefined) updateData.target_country = target_country;
    if (tax_type !== undefined) updateData.tax_type = tax_type;
    if (has_movement !== undefined) updateData.has_movement = has_movement;
    if (status_detail !== undefined) updateData.status_detail = status_detail;
    if (billing_month !== undefined) updateData.billing_month = billing_month;
    if (client_contact_name !== undefined) updateData.client_contact_name = client_contact_name;
    if (revenue_note !== undefined) updateData.revenue_note = revenue_note;

    const { data, error } = await supabase
      .from('deals')
      .update(updateData)
      .eq('id', id)
      .select('*, contact:contacts(*)')
      .single();

    if (error || !data) {
      console.error('案件の更新に失敗しました:', error?.message);
      return NextResponse.json(
        { data: null, error: '案件の更新に失敗しました' },
        { status: 500 }
      );
    }

    const contact = Array.isArray(data.contact) ? data.contact[0] : data.contact;
    const deal: DealWithContact = {
      id: data.id,
      contact_id: data.contact_id,
      title: data.title,
      phase: data.phase,
      probability: data.probability,
      next_action: data.next_action,
      next_action_date: data.next_action_date,
      assigned_to: data.assigned_to,
      note: data.note,
      deliverable: data.deliverable ?? null,
      industry: data.industry ?? null,
      deadline: data.deadline ?? null,
      revenue: data.revenue ?? null,
      target_country: data.target_country ?? null,
      tax_type: data.tax_type ?? null,
      has_movement: data.has_movement ?? false,
      status_detail: data.status_detail ?? null,
      billing_month: data.billing_month ?? null,
      client_contact_name: data.client_contact_name ?? null,
      revenue_note: data.revenue_note ?? null,
      created_at: data.created_at,
      updated_at: data.updated_at,
      contact: contact ?? null,
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
