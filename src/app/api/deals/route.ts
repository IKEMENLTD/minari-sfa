import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, validateContentType, isAuthError } from '@/lib/auth';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';
import { stripHtml } from '@/lib/sanitize';
import type { DealRow, DealWithContact, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション（B3: HTMLタグ除去によるXSS防止）
// ---------------------------------------------------------------------------

const sanitizedStringNullable = (maxLen: number) => z.string().max(maxLen).transform(stripHtml).nullable().optional();

const createDealSchema = z.object({
  contact_id: z.string().uuid('contact_id は有効なUUIDを指定してください'),
  title: z.string().min(1, '案件名は必須です').max(500).transform(stripHtml),
  phase: z.enum(['proposal_planned', 'proposal_active', 'waiting', 'follow_up', 'active']),
  probability: z.enum(['high', 'medium', 'low', 'very_low', 'unknown']).nullable().optional(),
  next_action: sanitizedStringNullable(500),
  next_action_date: z.string().max(20).nullable().optional(),
  assigned_to: z.string().uuid().optional(),
  note: sanitizedStringNullable(2000),
  deliverable: sanitizedStringNullable(1000),
  industry: sanitizedStringNullable(500),
  deadline: z.string().max(20).nullable().optional(),
  revenue: z.number().int().min(0, '報酬は0以上を指定してください').nullable().optional(),
  target_country: sanitizedStringNullable(200),
  tax_type: z.enum(['included', 'excluded']).nullable().optional(),
  has_movement: z.boolean().optional(),
  status_detail: sanitizedStringNullable(1000),
  billing_month: sanitizedStringNullable(50),
  client_contact_name: sanitizedStringNullable(200),
  revenue_note: sanitizedStringNullable(1000),
}).strict();

// ---------------------------------------------------------------------------
// GET /api/deals - 案件一覧
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResult<DealWithContact[]>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<DealWithContact[]>>;

  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);

    const phase = searchParams.get('phase');
    const assignedTo = searchParams.get('assigned_to');
    const search = searchParams.get('search')?.trim() ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
    const offset = (page - 1) * limit;

    let query = supabase
      .from('deals')
      .select('*, contact:contacts(*)')
      .order('updated_at', { ascending: false });

    // 検索: title, deliverable, client_contact_name を部分一致検索
    if (search) {
      query = query.or(`title.ilike.%${search}%,deliverable.ilike.%${search}%,client_contact_name.ilike.%${search}%`);
    }

    if (phase) {
      const validPhases = ['proposal_planned', 'proposal_active', 'waiting', 'follow_up', 'active'];
      if (validPhases.includes(phase)) {
        query = query.eq('phase', phase);
      }
    }

    // assigned_to UUID検証
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (assignedTo && !uuidRegex.test(assignedTo)) {
      return NextResponse.json(
        { data: null, error: '無効な担当者IDです' },
        { status: 400 }
      );
    }

    if (assignedTo) {
      query = query.eq('assigned_to', assignedTo);
    }

    // contact_id フィルタ
    const contactId = searchParams.get('contact_id');
    if (contactId) {
      if (!uuidRegex.test(contactId)) {
        return NextResponse.json(
          { data: null, error: '無効なコンタクトIDです' },
          { status: 400 }
        );
      }
      query = query.eq('contact_id', contactId);
    }

    // memberロールは自分の担当のみ閲覧可能
    if (auth.role === 'member') {
      query = query.eq('assigned_to', auth.userId);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      console.error('案件一覧の取得に失敗しました:', error.message);
      return NextResponse.json(
        { data: null, error: '案件一覧の取得に失敗しました' },
        { status: 500 }
      );
    }

    const deals: DealWithContact[] = (data ?? []).map((row) => {
      const contact = Array.isArray(row.contact) ? row.contact[0] : row.contact;
      return {
        id: row.id,
        contact_id: row.contact_id,
        title: row.title,
        phase: row.phase,
        probability: row.probability,
        next_action: row.next_action,
        next_action_date: row.next_action_date,
        assigned_to: row.assigned_to,
        note: row.note,
        deliverable: row.deliverable ?? null,
        industry: row.industry ?? null,
        deadline: row.deadline ?? null,
        revenue: row.revenue ?? null,
        target_country: row.target_country ?? null,
        tax_type: row.tax_type ?? null,
        has_movement: row.has_movement ?? false,
        status_detail: row.status_detail ?? null,
        billing_month: row.billing_month ?? null,
        client_contact_name: row.client_contact_name ?? null,
        revenue_note: row.revenue_note ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        contact: contact ?? null,
      };
    });

    return NextResponse.json({ data: deals, error: null });
  } catch (err) {
    console.error('案件一覧の取得中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '案件一覧の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/deals - 案件新規作成
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResult<DealRow>>> {
  const contentTypeError = validateContentType(request);
  if (contentTypeError) return contentTypeError as NextResponse<ApiResult<DealRow>>;

  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<DealRow>>;

  try {
    const body: unknown = await request.json();
    const parsed = createDealSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: `入力値が不正です: ${parsed.error.issues.map((e) => e.message).join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const insertData: Record<string, unknown> = {
      contact_id: parsed.data.contact_id,
      title: parsed.data.title,
      phase: parsed.data.phase,
      assigned_to: parsed.data.assigned_to ?? auth.userId,
    };
    if (parsed.data.probability !== undefined) insertData.probability = parsed.data.probability;
    if (parsed.data.next_action !== undefined) insertData.next_action = parsed.data.next_action;
    if (parsed.data.next_action_date !== undefined) insertData.next_action_date = parsed.data.next_action_date;
    if (parsed.data.note !== undefined) insertData.note = parsed.data.note;
    if (parsed.data.deliverable !== undefined) insertData.deliverable = parsed.data.deliverable;
    if (parsed.data.industry !== undefined) insertData.industry = parsed.data.industry;
    if (parsed.data.deadline !== undefined) insertData.deadline = parsed.data.deadline;
    if (parsed.data.revenue !== undefined) insertData.revenue = parsed.data.revenue;
    if (parsed.data.target_country !== undefined) insertData.target_country = parsed.data.target_country;
    if (parsed.data.tax_type !== undefined) insertData.tax_type = parsed.data.tax_type;
    if (parsed.data.has_movement !== undefined) insertData.has_movement = parsed.data.has_movement;
    if (parsed.data.status_detail !== undefined) insertData.status_detail = parsed.data.status_detail;
    if (parsed.data.billing_month !== undefined) insertData.billing_month = parsed.data.billing_month;
    if (parsed.data.client_contact_name !== undefined) insertData.client_contact_name = parsed.data.client_contact_name;
    if (parsed.data.revenue_note !== undefined) insertData.revenue_note = parsed.data.revenue_note;

    const { data, error } = await supabase
      .from('deals')
      .insert(insertData)
      .select('*')
      .single();

    if (error || !data) {
      console.error('案件の作成に失敗しました:', error?.message);
      return NextResponse.json(
        { data: null, error: '案件の作成に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: data as DealRow, error: null },
      { status: 201 }
    );
  } catch (err) {
    console.error('案件の作成中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '案件の作成中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
