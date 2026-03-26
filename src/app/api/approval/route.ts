import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, validateContentType } from '@/lib/auth';
import { appendToDocument } from '@/lib/external/google-drive';
import type { ApprovalRow, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const approvalSchema = z.object({
  meetingId: z.string().uuid(),
  isCorrect: z.boolean(),
  correctedCompany: z.string().max(500).optional(),
  correctionNote: z.string().max(2000).optional(),
}).strict();

// ---------------------------------------------------------------------------
// POST /api/approval - 承認処理
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResult<ApprovalRow>>> {
  const contentTypeError = validateContentType(request);
  if (contentTypeError) return contentTypeError as NextResponse<ApiResult<ApprovalRow>>;

  const authResult = await validateAuth(request);
  if (authResult instanceof NextResponse) return authResult as NextResponse<ApiResult<ApprovalRow>>;

  try {
    const body: unknown = await request.json();
    const parsed = approvalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: `入力値が不正です: ${parsed.error.issues.map((e: { message: string }) => e.message).join(', ')}` },
        { status: 400 }
      );
    }

    const { meetingId, isCorrect, correctedCompany, correctionNote } = parsed.data;
    const supabase = createServerSupabaseClient();

    // 既に承認済みかチェック（重複承認防止）
    const { data: existingApproval } = await supabase
      .from('approvals')
      .select('id')
      .eq('meeting_id', meetingId)
      .limit(1)
      .single();

    if (existingApproval) {
      return NextResponse.json(
        { data: null, error: 'この商談は既に承認処理済みです' },
        { status: 409 }
      );
    }

    // 対象の商談を取得（承認処理に必要なフィールドのみ）
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('id, company_id, meeting_date, ai_estimated_company, approval_status')
      .eq('id', meetingId)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json(
        { data: null, error: '指定された商談が見つかりません' },
        { status: 404 }
      );
    }

    const aiEstimatedCompany = meeting.ai_estimated_company ?? '';

    // 承認レコードを作成（approved_by にユーザーIDを記録）
    const { data: approval, error: approvalError } = await supabase
      .from('approvals')
      .insert({
        meeting_id: meetingId,
        ai_estimated_company: aiEstimatedCompany,
        is_correct: isCorrect,
        corrected_company: correctedCompany ?? null,
        correction_note: correctionNote ?? null,
        approved_by: authResult.userId,
      })
      .select()
      .single();

    if (approvalError || !approval) {
      console.error('承認レコードの作成に失敗しました:', approvalError?.message);
      return NextResponse.json(
        { data: null, error: '承認レコードの作成に失敗しました' },
        { status: 500 }
      );
    }

    // 商談の approval_status を更新
    const { error: updateError } = await supabase
      .from('meetings')
      .update({
        approval_status: 'approved',
        approved_at: new Date().toISOString(),
        // 企業名が修正された場合は ai_estimated_company も更新
        ...(correctedCompany ? { ai_estimated_company: correctedCompany } : {}),
      })
      .eq('id', meetingId);

    if (updateError) {
      console.error('商談ステータスの更新に失敗しました:', updateError.message);
    }

    // Google ドキュメント追記トリガー（非同期で実行、失敗しても承認は成功とする）
    // 企業に紐づく Google Doc がある場合に追記
    const companyName = correctedCompany ?? aiEstimatedCompany;
    if (companyName && companyName !== '(社内)') {
      try {
        // 企業の Google Doc を検索
        const { data: companyData } = await supabase
          .from('companies')
          .select('id')
          .eq('name', companyName)
          .single();

        if (companyData) {
          const { data: googleDoc } = await supabase
            .from('google_docs')
            .select('doc_id')
            .eq('company_id', companyData.id)
            .single();

          if (googleDoc) {
            // 要約を取得して追記
            const { data: summary } = await supabase
              .from('summaries')
              .select('summary_text')
              .eq('meeting_id', meetingId)
              .single();

            const content = summary?.summary_text ?? `商談日: ${meeting.meeting_date}`;
            await appendToDocument(googleDoc.doc_id, content);
          }
        }
      } catch (docError) {
        // Google Docs への追記失敗はログに記録するが、承認処理自体は成功とする
        const docErrMsg = docError instanceof Error ? docError.message : '不明なエラー';
        console.error('Google Docs 追記に失敗しました:', docErrMsg);
      }
    }

    return NextResponse.json(
      { data: approval as ApprovalRow, error: null },
      { status: 201 }
    );
  } catch (err) {
    console.error('承認処理中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '承認処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
