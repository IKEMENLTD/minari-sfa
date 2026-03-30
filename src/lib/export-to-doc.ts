import { createServerSupabaseClient } from '@/lib/supabase/server';
import { replaceDocumentContent, createDocument } from '@/lib/external/google-drive';
import { generateAnalysisReport } from '@/lib/external/claude';
import type { AnalysisReportResult } from '@/types';

const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID ?? '';

/**
 * 企業のGoogle Docsを全面置換する
 * - 企業の全承認済み議事録を取得し、Docを丸ごと書き直す
 * - 再生成しても重複しない（毎回全件で上書き）
 * - 新規企業はDoc自動作成、既存企業は既存Docを上書き
 */
export async function exportMeetingToDoc(meetingId: string): Promise<{ docUrl: string; isNew: boolean } | null> {
  if (!GOOGLE_DRIVE_FOLDER_ID) {
    console.error('GOOGLE_DRIVE_FOLDER_ID が未設定のためGoogle Docs書き出しをスキップ');
    return null;
  }

  const supabase = createServerSupabaseClient();

  // 対象の商談データ取得
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, company_id, ai_estimated_company')
    .eq('id', meetingId)
    .single();

  if (!meeting) return null;

  // 企業名・IDを決定
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

  // 企業がなければ検索・作成
  if (!companyId) {
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('id')
      .eq('name', companyName)
      .limit(1)
      .maybeSingle();

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
    .limit(1)
    .maybeSingle();

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

  // ---- 全面置換: 企業の全承認済み議事録を取得してDocを書き直す ----

  const { data: allMeetings } = await supabase
    .from('meetings')
    .select('id, meeting_date, participants, source, ai_estimated_company')
    .eq('company_id', companyId)
    .eq('approval_status', 'approved')
    .order('meeting_date', { ascending: true });

  if (!allMeetings || allMeetings.length === 0) {
    // 承認済みがなければ対象meetingだけで書き出し
    const { data: summary } = await supabase
      .from('summaries')
      .select('summary_text')
      .eq('meeting_id', meetingId)
      .single();

    const singleContent = buildSectionContent(meeting, summary, companyName);
    const summaryTexts = summary?.summary_text ? [summary.summary_text as string] : [];
    const analysisReport = await generateAnalysisReportSafe(companyName, summaryTexts);
    await replaceDocumentContent(docId, buildFullDocument(companyName, [singleContent], analysisReport));
    return { docUrl, isNew };
  }

  // 各議事録のセクションを生成
  const meetingIds = allMeetings.map((m) => m.id as string);
  const { data: summaries } = await supabase
    .from('summaries')
    .select('meeting_id, summary_text')
    .in('meeting_id', meetingIds);

  const summaryMap = new Map<string, string>();
  for (const s of summaries ?? []) {
    summaryMap.set(s.meeting_id as string, s.summary_text as string);
  }

  const sections: string[] = [];
  const summaryTexts: string[] = [];
  for (const m of allMeetings) {
    const summaryText = summaryMap.get(m.id as string) ?? '';
    sections.push(buildSectionContent(m, { summary_text: summaryText }, companyName));
    if (summaryText) summaryTexts.push(summaryText);
  }

  // 分析レポート生成（失敗しても議事録書き出しは継続）
  const analysisReport = await generateAnalysisReportSafe(companyName, summaryTexts);
  await replaceDocumentContent(docId, buildFullDocument(companyName, sections, analysisReport));

  return { docUrl, isNew };
}

// ---- ヘルパー関数 ----

/**
 * 分析レポート生成（失敗時はnullを返し、議事録書き出しを妨げない）
 */
async function generateAnalysisReportSafe(
  companyName: string,
  summaryTexts: string[],
): Promise<AnalysisReportResult | null> {
  if (summaryTexts.length === 0) return null;

  try {
    return await generateAnalysisReport(companyName, summaryTexts);
  } catch (err) {
    console.error('分析レポート生成に失敗しました（議事録書き出しは継続）:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * 分析レポートセクションをテキストに変換する
 */
function buildAnalysisSection(report: AnalysisReportResult): string {
  return [
    `${'*'.repeat(50)}`,
    `  AI 分析レポート（自動生成）`,
    `  生成日時: ${new Date().toISOString().split('T')[0]}`,
    `${'*'.repeat(50)}`,
    '',
    '[ エグゼクティブサマリー ]',
    report.executiveSummary,
    '',
    '[ 重要インサイト ]',
    report.keyInsights,
    '',
    '[ 課題・ニーズ分析 ]',
    report.challengesAndNeeds,
    '',
    '[ 商談タイムライン ]',
    report.timeline,
    '',
    '[ 想定FAQ ]',
    report.faq,
    '',
    '[ リスク評価 ]',
    report.riskAssessment,
    '',
    '[ 推奨アクション ]',
    report.recommendedActions,
    '',
    `${'*'.repeat(50)}`,
    '',
  ].join('\n');
}

function buildFullDocument(
  companyName: string,
  sections: string[],
  analysisReport?: AnalysisReportResult | null,
): string {
  const header = `${companyName} - 商談議事録\n${'='.repeat(50)}\n\n`;
  const analysisPart = analysisReport ? buildAnalysisSection(analysisReport) + '\n' : '';
  const meetingsHeader = `${'='.repeat(50)}\n  個別商談記録\n${'='.repeat(50)}\n\n`;
  return header + analysisPart + meetingsHeader + sections.join('\n\n');
}

function buildSectionContent(
  meeting: Record<string, unknown>,
  summary: { summary_text?: string } | null,
  companyName: string,
): string {
  const participants = (meeting.participants as string[]) ?? [];
  const summaryText = summary?.summary_text ?? '';

  return [
    `${'─'.repeat(40)}`,
    `商談日: ${meeting.meeting_date as string}`,
    `企業名: ${companyName}`,
    `参加者: ${participants.join(', ') || '(不明)'}`,
    `ソース: ${meeting.source as string}`,
    `${'─'.repeat(40)}`,
    '',
    summaryText || '(要約なし)',
  ].join('\n');
}
