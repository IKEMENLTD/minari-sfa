import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, validateContentType, isAuthError } from '@/lib/auth';
import type { InquiryRow, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

const updateInquirySchema = z.object({
  status: z.enum(['new', 'in_progress', 'completed']).optional(),
  contact_id: z.string().uuid().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
}).strict();

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

    const { status, contact_id, assigned_to, note } = parsed.data;
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
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
