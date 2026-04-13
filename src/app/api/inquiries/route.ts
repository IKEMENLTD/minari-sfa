import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, validateContentType, isAuthError } from '@/lib/auth';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';
import { stripHtml } from '@/lib/sanitize';
import type { InquiryRow, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション（B3: HTMLタグ除去によるXSS防止）
// ---------------------------------------------------------------------------

const sanitizedStringNullable = (maxLen: number) => z.string().max(maxLen).transform(stripHtml).nullable().optional();

const createInquirySchema = z.object({
  source: z.enum(['website', 'phone', 'other']),
  contact_name: z.string().min(1, '連絡先名は必須です').max(200).transform(stripHtml),
  company_name: sanitizedStringNullable(200),
  contact_id: z.string().uuid().nullable().optional(),
  content: z.string().min(1, '問い合わせ内容は必須です').max(5000).transform(stripHtml),
  assigned_to: z.string().uuid().nullable().optional(),
  note: sanitizedStringNullable(2000),
}).strict();

// ---------------------------------------------------------------------------
// GET /api/inquiries - 問い合わせ一覧
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResult<InquiryRow[]>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<InquiryRow[]>>;

  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status');
    const source = searchParams.get('source');
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
    const offset = (page - 1) * limit;

    let query = supabase
      .from('inquiries')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) {
      const validStatuses = ['new', 'in_progress', 'completed'];
      if (validStatuses.includes(status)) {
        query = query.eq('status', status);
      }
    }

    if (source) {
      const validSources = ['website', 'phone', 'other'];
      if (validSources.includes(source)) {
        query = query.eq('source', source);
      }
    }

    // memberロールは自分の担当のみ閲覧可能
    if (auth.role === 'member') {
      query = query.eq('assigned_to', auth.userId);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      console.error('問い合わせ一覧の取得に失敗しました:', error.message);
      return NextResponse.json(
        { data: null, error: '問い合わせ一覧の取得に失敗しました' },
        { status: 500 }
      );
    }

    // --- 月別サマリー（直近2ヶ月） ---
    const now = new Date();
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const twoMonthsAgoStr = twoMonthsAgo.toISOString().slice(0, 10);

    let summaryQuery = supabase
      .from('inquiries')
      .select('created_at, source')
      .gte('created_at', twoMonthsAgoStr)
      .order('created_at', { ascending: false });

    if (auth.role === 'member') {
      summaryQuery = summaryQuery.eq('assigned_to', auth.userId);
    }

    const { data: summaryRows } = await summaryQuery;

    const monthMap: Record<string, { website: number; phone: number; other: number; total: number }> = {};
    for (const row of summaryRows ?? []) {
      const month = (row.created_at as string).slice(0, 7); // "2026-04"
      if (!monthMap[month]) {
        monthMap[month] = { website: 0, phone: 0, other: 0, total: 0 };
      }
      const src = row.source as string;
      if (src === 'website') monthMap[month].website++;
      else if (src === 'phone') monthMap[month].phone++;
      else monthMap[month].other++;
      monthMap[month].total++;
    }

    const monthlySummary = Object.entries(monthMap)
      .map(([month, counts]) => ({ month, ...counts }))
      .sort((a, b) => b.month.localeCompare(a.month));

    return NextResponse.json({ data: (data ?? []) as InquiryRow[], monthlySummary, error: null });
  } catch (err) {
    console.error('問い合わせ一覧の取得中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '問い合わせ一覧の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/inquiries - 問い合わせ新規作成
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResult<InquiryRow>>> {
  const contentTypeError = validateContentType(request);
  if (contentTypeError) return contentTypeError as NextResponse<ApiResult<InquiryRow>>;

  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<InquiryRow>>;

  try {
    const body: unknown = await request.json();
    const parsed = createInquirySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: `入力値が不正です: ${parsed.error.issues.map((e) => e.message).join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const insertData: Record<string, unknown> = {
      source: parsed.data.source,
      contact_name: parsed.data.contact_name,
      content: parsed.data.content,
      status: 'new',
    };
    if (parsed.data.company_name !== undefined) insertData.company_name = parsed.data.company_name;
    if (parsed.data.contact_id !== undefined) insertData.contact_id = parsed.data.contact_id;
    if (parsed.data.assigned_to !== undefined) insertData.assigned_to = parsed.data.assigned_to;
    if (parsed.data.note !== undefined) insertData.note = parsed.data.note;

    const { data, error } = await supabase
      .from('inquiries')
      .insert(insertData)
      .select('*')
      .single();

    if (error || !data) {
      console.error('問い合わせの作成に失敗しました:', error?.message);
      return NextResponse.json(
        { data: null, error: '問い合わせの作成に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: data as InquiryRow, error: null },
      { status: 201 }
    );
  } catch (err) {
    console.error('問い合わせの作成中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '問い合わせの作成中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
