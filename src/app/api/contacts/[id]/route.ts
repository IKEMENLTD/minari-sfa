import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, validateContentType, isAuthError, requireRole } from '@/lib/auth';
import { stripHtml } from '@/lib/sanitize';
import type { ContactRow, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション（B3: HTMLタグ除去によるXSS防止）
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

const sanitizedStringNullable = (maxLen: number) => z.string().max(maxLen).transform(stripHtml).nullable().optional();

const updateContactSchema = z.object({
  full_name: z.string().min(1).max(200).transform(stripHtml).optional(),
  company_name: sanitizedStringNullable(200),
  department: sanitizedStringNullable(200),
  position: sanitizedStringNullable(200),
  email: z.string().email('メールアドレスの形式が不正です').max(200).nullable().optional(),
  phone: z.string().max(50).transform(stripHtml).nullable().optional(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  assigned_to: z.string().uuid().optional(),
  note: sanitizedStringNullable(2000),
  expected_updated_at: z.string().optional(),
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

    // memberロールは自分の担当リソースのみアクセス可能（IDOR防止）
    if (auth.role === 'member' && data.assigned_to !== auth.userId) {
      return NextResponse.json(
        { data: null, error: 'アクセス権限がありません' },
        { status: 403 }
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

    // 楽観的ロック: expected_updated_at が指定されている場合、現在のレコードと比較
    if (parsed.data.expected_updated_at) {
      const { data: current } = await supabase.from('contacts').select('updated_at').eq('id', id).single();
      if (current && current.updated_at !== parsed.data.expected_updated_at) {
        return NextResponse.json(
          { data: null, error: '他のユーザーによって更新されています。画面を再読み込みしてください。' },
          { status: 409 }
        );
      }
    }

    // memberロールは自分の担当リソースのみ更新可能（IDOR防止）
    if (auth.role === 'member') {
      const { data: existing } = await supabase.from('contacts').select('assigned_to').eq('id', id).single();
      if (!existing) {
        return NextResponse.json({ data: null, error: '指定されたコンタクトが見つかりません' }, { status: 404 });
      }
      if (existing.assigned_to !== auth.userId) {
        return NextResponse.json({ data: null, error: 'アクセス権限がありません' }, { status: 403 });
      }
    }

    // memberロールはassigned_toの変更を禁止（C3: 担当者の任意変更防止）
    if (auth.role === 'member' && parsed.data.assigned_to !== undefined && parsed.data.assigned_to !== auth.userId) {
      return NextResponse.json({ data: null, error: '担当者の変更権限がありません' }, { status: 403 });
    }

    const { full_name, company_name, department, position, email, phone, tier, assigned_to, note } = parsed.data;
    const updateData: Record<string, unknown> = {};
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

// ---------------------------------------------------------------------------
// DELETE /api/contacts/[id] - コンタクト削除
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<null>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<null>>;
  const roleError = requireRole(auth, ['admin']);
  if (roleError) return roleError as NextResponse<ApiResult<null>>;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json({ data: null, error: '無効なIDフォーマットです' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { data: existing } = await supabase.from('contacts').select('id').eq('id', id).single();
    if (!existing) {
      return NextResponse.json({ data: null, error: '指定されたコンタクトが見つかりません' }, { status: 404 });
    }

    const { count: dealCount } = await supabase.from('deals').select('*', { count: 'exact', head: true }).eq('contact_id', id);
    const { count: meetingCount } = await supabase.from('meetings').select('*', { count: 'exact', head: true }).eq('contact_id', id);

    if ((dealCount ?? 0) > 0 || (meetingCount ?? 0) > 0) {
      return NextResponse.json(
        { data: null, error: '関連する案件または会議が存在するため削除できません。先に関連データの紐付けを解除してください。' },
        { status: 409 }
      );
    }

    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) {
      console.error('コンタクトの削除に失敗しました:', error.message);
      return NextResponse.json({ data: null, error: 'コンタクトの削除に失敗しました' }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('コンタクトの削除中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json({ data: null, error: 'コンタクトの削除中にエラーが発生しました' }, { status: 500 });
  }
}
