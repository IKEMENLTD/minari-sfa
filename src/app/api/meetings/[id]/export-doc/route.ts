import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, isAuthError } from '@/lib/auth';
import { appendToDocument, createDocument } from '@/lib/external/google-drive';
import type { ApiResult } from '@/types';

const uuidSchema = z.string().uuid();
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID ?? '';

interface ExportResult {
  docUrl: string;
  isNew: boolean;
}

// POST /api/meetings/[id]/export-doc
// 承認済み商談のGoogle Docs書き出し（新規作成 or 追記）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<ExportResult>>> {
  const authResult = await validateAuth(request);
  if (isAuthError(authResult)) return authResult as NextResponse<ApiResult<ExportResult>>;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json(
        { data: null, error: '無効なIDフォーマットです' },
        { status: 400 }
      );
    }

    if (!GOOGLE_DRIVE_FOLDER_ID) {
      return NextResponse.json(
        { data: null, error: 'GOOGLE_DRIVE_FOLDER_ID が設定されていません' },
        { status: 500 }
      );
    }

    const supabase = createServerSupabaseClient();

    // 商談データ取得
    const { data: meeting } = await supabase
      .from('meetings')
      .select('id, company_id, meeting_date, participants, source, ai_estimated_company, approval_status')
      .eq('id', id)
      .single();

    if (!meeting) {
      return NextResponse.json(
        { data: null, error: '商談が見つかりません' },
        { status: 404 }
      );
    }

    // 企業名を決定
    let companyName = meeting.ai_estimated_company as string || '';
    let companyId = meeting.company_id as string | null;

    if (companyId) {
      const { data: company } = await supabase
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .single();
      if (company) companyName = company.name as string;
    }

    if (!companyName || companyName === '(社内)') {
      return NextResponse.json(
        { data: null, error: '社内会議はGoogle Docsに書き出せません' },
        { status: 400 }
      );
    }

    // 企業がなければ作成
    if (!companyId) {
      const { data: existingCompany } = await supabase
        .from('companies')
        .select('id')
        .eq('name', companyName)
        .single();

      if (existingCompany) {
        companyId = existingCompany.id as string;
      } else {
        const { data: newCompany } = await supabase
          .from('companies')
          .insert({ name: companyName })
          .select('id')
          .single();
        companyId = newCompany?.id as string | null;
      }

      if (companyId) {
        await supabase.from('meetings').update({ company_id: companyId }).eq('id', id);
      }
    }

    if (!companyId) {
      return NextResponse.json(
        { data: null, error: '企業の作成に失敗しました' },
        { status: 500 }
      );
    }

    // Google Doc を検索 or 作成
    let docId: string;
    let docUrl: string;
    let isNew = false;

    const { data: existingDoc } = await supabase
      .from('google_docs')
      .select('doc_id, doc_url')
      .eq('company_id', companyId)
      .single();

    if (existingDoc) {
      docId = existingDoc.doc_id as string;
      docUrl = existingDoc.doc_url as string;
    } else {
      const docResult = await createDocument(companyName, GOOGLE_DRIVE_FOLDER_ID);
      docId = docResult.docId;
      docUrl = docResult.docUrl;
      isNew = true;

      await supabase.from('google_docs').insert({
        company_id: companyId,
        doc_url: docUrl,
        doc_id: docId,
        folder: GOOGLE_DRIVE_FOLDER_ID,
      });
    }

    // 要約を取得
    const { data: summary } = await supabase
      .from('summaries')
      .select('summary_text')
      .eq('meeting_id', id)
      .single();

    const participants = (meeting.participants as string[]) ?? [];
    const summaryText = (summary?.summary_text as string) ?? '';

    const docContent = [
      `========================================`,
      `商談日: ${meeting.meeting_date as string}`,
      `企業名: ${companyName}`,
      `参加者: ${participants.join(', ')}`,
      `ソース: ${meeting.source as string}`,
      `========================================`,
      '',
      summaryText || '(要約なし)',
      '',
    ].join('\n');

    await appendToDocument(docId, docContent);

    return NextResponse.json({
      data: { docUrl, isNew },
      error: null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '不明なエラー';
    console.error('Google Docs書き出しエラー:', msg);
    return NextResponse.json(
      { data: null, error: `Google Docs書き出し失敗: ${msg}` },
      { status: 500 }
    );
  }
}
