import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, validateContentType, isAuthError } from '@/lib/auth';
import type { ContactRow, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

const updateContactSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  company_name: z.string().max(200).nullable().optional(),
  department: z.string().max(200).nullable().optional(),
  position: z.string().max(200).nullable().optional(),
  email: z.string().email('メールアドレスの形式が不正です').max(200).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  assigned_to: z.string().uuid().optional(),
  note: z.string().max(2000).nullable().optional(),
}).strict();

// ---------------------------------------------------------------------------
// GET /api/contacts/[id] - コンタクト詳細
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<ContactRow>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<ContactRow>>;

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
      .from('contacts')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { data: null, error: '指定されたコンタクトが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: data as ContactRow, error: null });
  } catch (err) {
    console.error('コンタクト詳細の取得中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: 'コンタクト詳細の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/contacts/[id] - コンタクト更新
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<ContactRow>>> {
  const contentTypeError = validateContentType(request);
  if (contentTypeError) return contentTypeError as NextResponse<ApiResult<ContactRow>>;

  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<ContactRow>>;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json(
        { data: null, error: '無効なIDフォーマットです' },
        { status: 400 }
      );
    }

    const body: unknown = await request.json();
    const parsed = updateContactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: `入力値が不正です: ${parsed.error.issues.map((e) => e.message).join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { full_name, company_name, department, position, email, phone, tier, assigned_to, note } = parsed.data;
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (full_name !== undefined) updateData.full_name = full_name;
    if (company_name !== undefined) updateData.company_name = company_name;
    if (department !== undefined) updateData.department = department;
    if (position !== undefined) updateData.position = position;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (tier !== undefined) updateData.tier = tier;
    if (assigned_to !== undefined) updateData.assigned_to = assigned_to;
    if (note !== undefined) updateData.note = note;

    const { data, error } = await supabase
      .from('contacts')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      console.error('コンタクトの更新に失敗しました:', error?.message);
      return NextResponse.json(
        { data: null, error: 'コンタクトの更新に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data as ContactRow, error: null });
  } catch (err) {
    console.error('コンタクトの更新中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: 'コンタクトの更新中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
