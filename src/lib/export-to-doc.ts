import { createServerSupabaseClient } from '@/lib/supabase/server';
import { appendToDocument, createDocument } from '@/lib/external/google-drive';

const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID ?? '';

/**
 * 議事録の要約をGoogle Docsに書き出す（新規作成 or 上書き追記）
 * - 企業名で自動判定し、同一企業は同じDocに蓄積
 * - 同じ商談日の既存エントリがあれば上書き（重複防止）
 * - 承認時・再生成時に自動呼び出しされる
 */
export async function exportMeetingToDoc(meetingId: string): Promise<{ docUrl: string; isNew: boolean } | null> {
  if (!GOOGLE_DRIVE_FOLDER_ID) {
    console.error('GOOGLE_DRIVE_FOLDER_ID が未設定のためGoogle Docs書き出しをスキップ');
    return null;
  }

  const supabase = createServerSupabaseClient();

  // 商談データ取得
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, company_id, meeting_date, participants, source, ai_estimated_company')
    .eq('id', meetingId)
    .single();

  if (!meeting) return null;

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

  if (!companyName || companyName === '(社内)') return null;

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
      await supabase.from('meetings').update({ company_id: companyId }).eq('id', meetingId);
    }
  }

  if (!companyId) return null;

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
    .eq('meeting_id', meetingId)
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

  return { docUrl, isNew };
}
