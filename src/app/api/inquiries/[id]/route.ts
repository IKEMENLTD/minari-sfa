import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, validateContentType, isAuthError, requireRole } from '@/lib/auth';
import { stripHtml } from '@/lib/sanitize';
import type { InquiryRow, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション（B3: HTMLタグ除去によるXSS防止）
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

const updateInquirySchema = z.object({
  status: z.enum(['new', 'in_progress', 'completed']).optional(),
  contact_id: z.string().uuid().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  note: z.string().max(2000).transform(stripHtml).nullable().optional(),
  expected_updated_at: z.string().optional(),
}).strict();

// ---------------------------------------------------------------------------
// GET /api/inquiries/[id] - 問い合わせ詳細
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<InquiryRow>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<InquiryRow>>;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json({ data: null, error: '無効なIDフォーマットです' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('inquiries')
      .select('*, contact:contacts(id, full_name, company_name)')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ data: null, error: '指定された問い合わせが見つかりません' }, { status: 404 });
    }

    if (auth.role === 'member' && data.assigned_to !== auth.userId) {
      return NextResponse.json({ data: null, error: 'アクセス権限がありません' }, { status: 403 });
    }

    return NextResponse.json({ data: data as InquiryRow, error: null });
  } catch (err) {
    console.error('問い合わせ詳細の取得中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json({ data: null, error: '問い合わせ詳細の取得中にエラーが発生しました' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/inquiries/[id] - 問い合わせ更新
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<InquiryRow>>> {
  const contentTypeError = validateContentType(request);
  if (contentTypeError) return contentTypeError as NextResponse<ApiResult<InquiryRow>>;

  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<InquiryRow>>;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json(
        { data: null, error: '無効なIDフォーマットです' },
        { status: 400 }
      );
    }

    const body: unknown = await request.json();
    const parsed = updateInquirySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: `入力値が不正です: ${parsed.error.issues.map((e) => e.message).join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // 楽観的ロック: expected_updated_at が指定されている場合、現在のレコードと比較
    if (parsed.data.expected_updated_at) {
      const { data: current } = await supabase.from('inquiries').select('updated_at').eq('id', id).single();
      if (current && current.updated_at !== parsed.data.expected_updated_at) {
        return NextResponse.json(
          { data: null, error: '他のユーザーによって更新されています。画面を再読み込みしてください。' },
          { status: 409 }
        );
      }
    }

    // memberロールは自分の担当リソースのみ更新可能（IDOR防止）
    if (auth.role === 'member') {
      const { data: existing } = await supabase.from('inquiries').select('assigned_to').eq('id', id).single();
      if (!existing) {
        return NextResponse.json({ data: null, error: '指定された問い合わせが見つかりません' }, { status: 404 });
      }
      if (existing.assigned_to !== auth.userId) {
        return NextResponse.json({ data: null, error: 'アクセス権限がありません' }, { status: 403 });
      }
    }

    // memberロールはassigned_toの変更を禁止（C3: 担当者の任意変更防止）
    if (auth.role === 'member' && parsed.data.assigned_to !== undefined && parsed.data.assigned_to !== null && parsed.data.assigned_to !== auth.userId) {
      return NextResponse.json({ data: null, error: '担当者の変更権限がありません' }, { status: 403 });
    }

    const { status, contact_id, assigned_to, note } = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (contact_id !== undefined) updateData.contact_id = contact_id;
    if (assigned_to !== undefined) updateData.assigned_to = assigned_to;
    if (note !== undefined) updateData.note = note;

    const { data, error } = await supabase
      .from('inquiries')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      console.error('問い合わせの更新に失敗しました:', error?.message);
      return NextResponse.json(
        { data: null, error: '問い合わせの更新に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data as InquiryRow, error: null });
  } catch (err) {
    console.error('問い合わせの更新中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '問い合わせの更新中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/inquiries/[id] - 問い合わせ削除
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

    const { data: existing } = await supabase.from('inquiries').select('id').eq('id', id).single();
    if (!existing) {
      return NextResponse.json({ data: null, error: '指定された問い合わせが見つかりません' }, { status: 404 });
    }

    const { error } = await supabase.from('inquiries').delete().eq('id', id);
    if (error) {
      console.error('問い合わせの削除に失敗しました:', error.message);
      return NextResponse.json({ data: null, error: '問い合わせの削除に失敗しました' }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('問い合わせの削除中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json({ data: null, error: '問い合わせの削除中にエラーが発生しました' }, { status: 500 });
  }
}
