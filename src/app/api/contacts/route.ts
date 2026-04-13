import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, validateContentType, isAuthError } from '@/lib/auth';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';
import { stripHtml } from '@/lib/sanitize';
import type { ContactRow, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション（B3: HTMLタグ除去によるXSS防止）
// ---------------------------------------------------------------------------

const sanitizedStringNullable = (maxLen: number) => z.string().max(maxLen).transform(stripHtml).nullable().optional();

const createContactSchema = z.object({
  full_name: z.string().min(1, '氏名は必須です').max(200).transform(stripHtml),
  company_name: sanitizedStringNullable(200),
  department: sanitizedStringNullable(200),
  position: sanitizedStringNullable(200),
  email: z.string().email('メールアドレスの形式が不正です').max(200).nullable().optional(),
  phone: z.string().max(50).transform(stripHtml).nullable().optional(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  assigned_to: z.string().uuid().optional(),
  note: sanitizedStringNullable(2000),
  source: z.enum(['eight', 'manual', 'tldv']).optional(),
}).strict();

// ---------------------------------------------------------------------------
// TODO [D1]: APIレート制限はサーバーレス環境ではインメモリ方式が効かないため、
// Upstash Redis等の外部サービスでの実装を将来課題とする。
// TODO [E2]: Webhookリプレイ攻撃防止（タイムスタンプ検証）は将来課題。
// TODO [F2]: select('*') を必要なカラムのみに制限することは将来課題。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET /api/contacts - コンタクト一覧
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResult<ContactRow[]>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<ContactRow[]>>;

  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);

    const tier = searchParams.get('tier');
    const assignedTo = searchParams.get('assigned_to');
    const search = searchParams.get('search');
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
    const offset = (page - 1) * limit;

    let query = supabase
      .from('contacts')
      .select('*')
      .order('updated_at', { ascending: false });

    if (tier) {
      const tierNum = parseInt(tier, 10);
      if ([1, 2, 3, 4].includes(tierNum)) {
        query = query.eq('tier', tierNum);
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

    // memberロールは自分の担当のみ閲覧可能
    if (auth.role === 'member') {
      query = query.eq('assigned_to', auth.userId);
    }

    if (search) {
      // 特殊文字のエスケープ（フィルタインジェクション対策）
      const sanitized = search.replace(/[%_\\]/g, '\\$&').replace(/[,.()]/g, '');
      query = query.or(`full_name.ilike.%${sanitized}%,company_name.ilike.%${sanitized}%`);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      console.error('コンタクト一覧の取得に失敗しました:', error.message);
      return NextResponse.json(
        { data: null, error: 'コンタクト一覧の取得に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: (data ?? []) as ContactRow[], error: null });
  } catch (err) {
    console.error('コンタクト一覧の取得中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: 'コンタクト一覧の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/contacts - コンタクト新規作成
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResult<ContactRow>>> {
  const contentTypeError = validateContentType(request);
  if (contentTypeError) return contentTypeError as NextResponse<ApiResult<ContactRow>>;

  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<ContactRow>>;

  try {
    const body: unknown = await request.json();
    const parsed = createContactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: `入力値が不正です: ${parsed.error.issues.map((e) => e.message).join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const insertData: Record<string, unknown> = {
      full_name: parsed.data.full_name,
      assigned_to: parsed.data.assigned_to ?? auth.userId,
      source: parsed.data.source ?? 'manual',
      tier: parsed.data.tier ?? 3,
    };
    if (parsed.data.company_name !== undefined) insertData.company_name = parsed.data.company_name;
    if (parsed.data.department !== undefined) insertData.department = parsed.data.department;
    if (parsed.data.position !== undefined) insertData.position = parsed.data.position;
    if (parsed.data.email !== undefined) insertData.email = parsed.data.email;
    if (parsed.data.phone !== undefined) insertData.phone = parsed.data.phone;
    if (parsed.data.note !== undefined) insertData.note = parsed.data.note;

    const { data, error } = await supabase
      .from('contacts')
      .insert(insertData)
      .select('*')
      .single();

    if (error || !data) {
      console.error('コンタクトの作成に失敗しました:', error?.message);
      return NextResponse.json(
        { data: null, error: 'コンタクトの作成に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: data as ContactRow, error: null },
      { status: 201 }
    );
  } catch (err) {
    console.error('コンタクトの作成中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: 'コンタクトの作成中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
