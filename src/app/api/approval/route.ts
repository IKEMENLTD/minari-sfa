import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, validateContentType, requireRole, isAuthError } from '@/lib/auth';
import { appendToDocument, createDocument } from '@/lib/external/google-drive';
import { judgeSalesPhase } from '@/lib/external/claude';
import type { ApprovalRow, ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const approvalSchema = z.object({
  meetingId: z.string().uuid(),
  isCorrect: z.boolean(),
  correctedCompany: z.string().max(500).optional(),
  correctionNote: z.string().max(2000).optional(),
  action: z.enum(['approve', 'reject']).optional(),
}).strict();

// ---------------------------------------------------------------------------
// Google Drive フォルダ ID（環境変数から取得）
// ---------------------------------------------------------------------------

const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID ?? '';

// ---------------------------------------------------------------------------
// POST /api/approval - 承認処理
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResult<ApprovalRow>>> {
  const contentTypeError = validateContentType(request);
  if (contentTypeError) return contentTypeError as NextResponse<ApiResult<ApprovalRow>>;

  const authResult = await validateAuth(request);
  if (isAuthError(authResult)) return authResult as NextResponse<ApiResult<ApprovalRow>>;

  // ロールチェック: admin または manager のみ承認可能
  const roleError = requireRole(authResult, ['admin', 'manager']);
  if (roleError) return roleError as NextResponse<ApiResult<ApprovalRow>>;

  try {
    const body: unknown = await request.json();
    const parsed = approvalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: `入力値が不正です: ${parsed.error.issues.map((e: { message: string }) => e.message).join(', ')}` },
        { status: 400 }
      );
    }

    const { meetingId, isCorrect, correctedCompany, correctionNote, action } = parsed.data;
    const supabase = createServerSupabaseClient();

    // --- 却下（スキップ）処理 ---
    if (action === 'reject') {
      const { error: rejectError } = await supabase
        .from('meetings')
        .update({ approval_status: 'rejected' })
        .eq('id', meetingId);

      if (rejectError) {
        console.error('商談の却下に失敗しました:', rejectError.message);
        return NextResponse.json(
          { data: null, error: '商談の却下に失敗しました' },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { data: null, error: null } as unknown as ApiResult<ApprovalRow>,
        { status: 200 }
      );
    }

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
        approved_by: authResult.userId === 'mock-user-id' ? null : authResult.userId,
      })
      .select('id, meeting_id, ai_estimated_company, is_correct, corrected_company, correction_note, approved_by, created_at')
      .single();

    if (approvalError || !approval) {
      // UNIQUE制約違反（重複承認）の場合は409を返す
      if (approvalError?.code === '23505') {
        return NextResponse.json(
          { data: null, error: 'この商談は既に承認処理済みです' },
          { status: 409 }
        );
      }
      console.error('承認レコードの作成に失敗しました:', approvalError?.message);
      return NextResponse.json(
        { data: null, error: '承認レコードの作成に失敗しました' },
        { status: 500 }
      );
    }

    // 確定企業名を決定
    const confirmedCompanyName = correctedCompany ?? aiEstimatedCompany;

    // --- 企業登録 + company_id 紐付け ---
    let companyId: string | null = null;

    if (confirmedCompanyName && confirmedCompanyName !== '(社内)') {
      // 企業名で検索
      const { data: existingCompany } = await supabase
        .from('companies')
        .select('id')
        .eq('name', confirmedCompanyName)
        .single();

      if (existingCompany) {
        companyId = existingCompany.id as string;
      } else {
        // 新規企業を作成
        const { data: newCompany, error: companyInsertError } = await supabase
          .from('companies')
          .insert({ name: confirmedCompanyName })
          .select('id')
          .single();

        if (companyInsertError || !newCompany) {
          console.error('企業の作成に失敗しました:', companyInsertError?.message);
        } else {
          companyId = newCompany.id as string;

          // 新規企業の場合、Googleドキュメントも自動作成
          if (GOOGLE_DRIVE_FOLDER_ID) {
            try {
              const docResult = await createDocument(confirmedCompanyName, GOOGLE_DRIVE_FOLDER_ID);
              await supabase.from('google_docs').insert({
                company_id: companyId,
                doc_url: docResult.docUrl,
                doc_id: docResult.docId,
                folder: GOOGLE_DRIVE_FOLDER_ID,
              });
            } catch (docCreateErr) {
              const errMsg = docCreateErr instanceof Error ? docCreateErr.message : '不明なエラー';
              console.error('Google Docs 作成に失敗しました:', errMsg);
            }
          }
        }
      }
    }

    // 商談の approval_status と company_id を更新
    const meetingUpdateData: Record<string, string> = {
      approval_status: 'approved',
      approved_at: new Date().toISOString(),
    };
    if (correctedCompany) {
      meetingUpdateData.ai_estimated_company = correctedCompany;
    }
    if (companyId) {
      meetingUpdateData.company_id = companyId;
    }

    const { error: updateError } = await supabase
      .from('meetings')
      .update(meetingUpdateData)
      .eq('id', meetingId);

    if (updateError) {
      console.error('商談ステータスの更新に失敗しました:', updateError.message);
      return NextResponse.json(
        { data: null, error: '商談ステータスの更新に失敗しました' },
        { status: 500 }
      );
    }

    // --- Google ドキュメント追記 ---
    if (companyId && confirmedCompanyName !== '(社内)') {
      try {
        const { data: googleDoc } = await supabase
          .from('google_docs')
          .select('doc_id')
          .eq('company_id', companyId)
          .single();

        if (googleDoc) {
          const { data: summary } = await supabase
            .from('summaries')
            .select('summary_text')
            .eq('meeting_id', meetingId)
            .single();

          // 詳細取得（参加者情報を含む最新のmeetingデータ）
          const { data: fullMeeting } = await supabase
            .from('meetings')
            .select('meeting_date, participants, source')
            .eq('id', meetingId)
            .single();

          const meetingDate = (fullMeeting?.meeting_date as string) ?? '';
          const participants = (fullMeeting?.participants as string[]) ?? [];
          const source = (fullMeeting?.source as string) ?? '';
          const summaryText = summary?.summary_text ?? '';

          // NotebookLM対応の構造化フォーマット
          const docContent = [
            `========================================`,
            `商談日: ${meetingDate}`,
            `企業名: ${confirmedCompanyName}`,
            `参加者: ${participants.join(', ')}`,
            `ソース: ${source}`,
            `承認日: ${new Date().toISOString().split('T')[0]}`,
            `========================================`,
            '',
            summaryText,
            '',
          ].join('\n');

          await appendToDocument(googleDoc.doc_id as string, docContent);
        }
      } catch (docError) {
        const docErrMsg = docError instanceof Error ? docError.message : '不明なエラー';
        console.error('Google Docs 追記に失敗しました:', docErrMsg);
      }
    }

    // --- フェーズ判定 + deal_statuses UPSERT ---
    if (companyId) {
      try {
        // 該当企業の全承認済み議事録のsummary_textを収集
        const { data: companyMeetings } = await supabase
          .from('meetings')
          .select('id')
          .eq('company_id', companyId)
          .eq('approval_status', 'approved');

        if (companyMeetings && companyMeetings.length > 0) {
          const meetingIds = companyMeetings.map((m) => m.id as string);
          const { data: summaries } = await supabase
            .from('summaries')
            .select('summary_text')
            .in('meeting_id', meetingIds);

          const summaryTexts = (summaries ?? []).map((s) => s.summary_text as string);

          if (summaryTexts.length > 0) {
            const judgment = await judgeSalesPhase(summaryTexts);

            // sales_phasesテーブルからphase_nameで検索してcurrent_phase_idを取得
            const { data: phaseData } = await supabase
              .from('sales_phases')
              .select('id')
              .eq('id', judgment.phaseId)
              .single();

            // phaseIdで見つからない場合はphase_nameで検索
            let phaseId: string | null = phaseData?.id as string | null;
            if (!phaseId) {
              const { data: phaseByName } = await supabase
                .from('sales_phases')
                .select('id')
                .eq('phase_name', judgment.phaseId)
                .single();
              phaseId = phaseByName?.id as string | null;
            }

            if (phaseId) {
              // 最終商談日を取得
              const { data: latestMeeting } = await supabase
                .from('meetings')
                .select('meeting_date')
                .eq('company_id', companyId)
                .eq('approval_status', 'approved')
                .order('meeting_date', { ascending: false })
                .limit(1)
                .single();

              const lastMeetingDate = (latestMeeting?.meeting_date as string) ?? null;

              // deal_statuses UPSERT: 既存なら更新、なければ新規作成
              const { data: existingDeal } = await supabase
                .from('deal_statuses')
                .select('id')
                .eq('company_id', companyId)
                .single();

              if (existingDeal) {
                await supabase
                  .from('deal_statuses')
                  .update({
                    current_phase_id: phaseId,
                    next_action: judgment.nextAction,
                    status_summary: judgment.statusSummary,
                    last_meeting_date: lastMeetingDate,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', existingDeal.id);
              } else {
                await supabase
                  .from('deal_statuses')
                  .insert({
                    company_id: companyId,
                    current_phase_id: phaseId,
                    next_action: judgment.nextAction,
                    status_summary: judgment.statusSummary,
                    last_meeting_date: lastMeetingDate,
                  });
              }
            }
          }
        }
      } catch (phaseError) {
        const phaseErrMsg = phaseError instanceof Error ? phaseError.message : '不明なエラー';
        console.error('フェーズ判定に失敗しました:', phaseErrMsg);
        // フェーズ判定失敗は承認処理自体には影響させない
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
