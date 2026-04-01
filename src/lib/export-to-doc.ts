import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  replaceDocumentContent, createDocument,
  findCompanyFolder, createFolder, findSalesDeckDoc,
} from '@/lib/external/google-drive';
import { generateAnalysisReport } from '@/lib/external/claude';
import type { AnalysisReportResult } from '@/types';

const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID ?? '';

/** 分析レポート生成の専用タイムアウト（Renderの30秒制限対策） */
const ANALYSIS_TIMEOUT_MS = 15_000;

/**
 * 企業のGoogle Docsを全面置換する
 * - 企業の全承認済み議事録を取得し、Docを丸ごと書き直す
 * - 再生成しても重複しない（毎回全件で上書き）
 * - 新規企業はDoc自動作成、既存企業は既存Docを上書き
 */
export async function exportMeetingToDoc(meetingId: string): Promise<{ docUrl: string; isNew: boolean }> {
  if (!GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error('環境変数 GOOGLE_DRIVE_FOLDER_ID が未設定です');
  }

  const supabase = createServerSupabaseClient();

  // 対象の商談データ取得
  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select('id, company_id, ai_estimated_company')
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) {
    throw new Error(`商談データが見つかりません (id=${meetingId}): ${meetingError?.message ?? '該当なし'}`);
  }

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

  if (!companyName) {
    throw new Error('企業名が未設定です（ai_estimated_company が空）');
  }
  if (companyName === '(社内)') {
    throw new Error('社内会議のためGoogle Docs書き出し対象外です');
  }

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
      const { data: newCompany, error: insertErr } = await supabase
        .from('companies')
        .insert({ name: companyName })
        .select('id')
        .single();
      if (insertErr) {
        throw new Error(`企業レコード作成に失敗: ${insertErr.message}`);
      }
      companyId = newCompany?.id as string | null;
    }

    if (companyId) {
      await supabase.from('meetings').update({ company_id: companyId }).eq('id', meetingId);
    }
  }

  if (!companyId) {
    throw new Error('企業IDの取得・作成に失敗しました');
  }

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
    // --- サブフォルダ構造対応 ---
    // 1. 企業名のサブフォルダを検索（既存PLOUDフォルダを再利用）
    let companyFolderId: string;
    const existingFolder = await findCompanyFolder(companyName, GOOGLE_DRIVE_FOLDER_ID);

    if (existingFolder) {
      companyFolderId = existingFolder.folderId;
      console.log(`既存サブフォルダ発見: ${existingFolder.folderName} (${companyName})`);
    } else {
      // サブフォルダを新規作成
      companyFolderId = await createFolder(companyName, GOOGLE_DRIVE_FOLDER_ID);
      console.log(`サブフォルダ作成: ${companyName}`);
    }

    // 2. サブフォルダ内でSALES DECK Docを検索（自動修復）
    const foundDoc = await findSalesDeckDoc(companyName, companyFolderId);

    if (foundDoc) {
      docId = foundDoc.docId;
      docUrl = foundDoc.docUrl;
      console.log(`自動修復: 既存Doc発見 → DBに登録 (${companyName}): ${docUrl}`);
    } else {
      // サブフォルダ内に新規作成（権限不足なら親フォルダで再試行、容量超過は即エラー）
      try {
        const docResult = await createDocument(companyName, companyFolderId);
        docId = docResult.docId;
        docUrl = docResult.docUrl;
        isNew = true;
      } catch (createErr) {
        const msg = createErr instanceof Error ? createErr.message : '';
        if (msg.includes('storageQuotaExceeded') || msg.includes('storage quota')) {
          throw new Error('Google Driveの容量が上限に達しています。サービスアカウントのDrive内の不要ファイルを削除してください。');
        }
        if (msg.includes('403')) {
          console.warn(`サブフォルダへの書き込み権限なし → 親フォルダで再試行 (${companyName})`);
          const docResult = await createDocument(companyName, GOOGLE_DRIVE_FOLDER_ID);
          docId = docResult.docId;
          docUrl = docResult.docUrl;
          isNew = true;
          companyFolderId = GOOGLE_DRIVE_FOLDER_ID;
        } else {
          throw createErr;
        }
      }
    }

    const { error: docInsertErr } = await supabase.from('google_docs').insert({
      company_id: companyId,
      doc_url: docUrl,
      doc_id: docId,
      folder: companyFolderId,
    });
    if (docInsertErr) {
      console.error('google_docs登録エラー:', docInsertErr.message);
    }
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
  const { data: summaries } = meetingIds.length > 0
    ? await supabase
        .from('summaries')
        .select('meeting_id, summary_text')
        .in('meeting_id', meetingIds)
    : { data: [] };

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
 * 分析レポート生成（失敗・タイムアウト時はnullを返し、議事録書き出しを妨げない）
 * Renderの30秒リクエスト制限対策として、分析は専用の短いタイムアウトで実行する
 */
async function generateAnalysisReportSafe(
  companyName: string,
  summaryTexts: string[],
): Promise<AnalysisReportResult | null> {
  if (summaryTexts.length === 0) return null;

  try {
    const result = await Promise.race([
      generateAnalysisReport(companyName, summaryTexts),
      new Promise<null>((resolve) =>
        setTimeout(() => {
          console.warn(`分析レポート生成がタイムアウト (${ANALYSIS_TIMEOUT_MS}ms) — スキップして議事録書き出しを継続`);
          resolve(null);
        }, ANALYSIS_TIMEOUT_MS)
      ),
    ]);
    return result;
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
