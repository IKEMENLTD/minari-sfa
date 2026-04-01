import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  replaceDocumentWithHeadings, createDocument,
  findCompanyFolder, createFolder, findSalesDeckDoc,
} from '@/lib/external/google-drive';
import { generateAnalysisReport, summarizeMeeting } from '@/lib/external/claude';
import type { AnalysisReportResult } from '@/types';

const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID ?? '';

// ---------------------------------------------------------------------------
// 公開API
// ---------------------------------------------------------------------------

/**
 * 既存Docの有無を確認する（上書き確認ポップアップ用）
 */
export async function checkExistingDoc(meetingId: string): Promise<{
  exists: boolean;
  docUrl: string | null;
  companyName: string | null;
}> {
  const supabase = createServerSupabaseClient();

  const { data: meeting } = await supabase
    .from('meetings')
    .select('company_id, ai_estimated_company')
    .eq('id', meetingId)
    .single();

  if (!meeting) {
    return { exists: false, docUrl: null, companyName: null };
  }

  let companyName = meeting.ai_estimated_company as string || '';
  const companyId = meeting.company_id as string | null;

  if (companyId) {
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .single();
    if (company) companyName = company.name as string;

    const { data: existingDoc } = await supabase
      .from('google_docs')
      .select('doc_url')
      .eq('company_id', companyId)
      .limit(1)
      .maybeSingle();

    if (existingDoc) {
      return {
        exists: true,
        docUrl: existingDoc.doc_url as string,
        companyName,
      };
    }
  }

  return { exists: false, docUrl: null, companyName };
}

/**
 * 議事録のみをGoogle Docsに書き出す（同期処理）
 * - 企業の全承認済み議事録を取得し、Docを丸ごと書き直す
 * - 分析レポートは含めない（cronで別途生成）
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
  const { companyName, companyId } = await resolveCompany(supabase, meeting, meetingId);

  // Google Doc を検索 or 作成
  const { docId, docUrl, isNew } = await resolveOrCreateDoc(supabase, companyName, companyId);

  // 全承認済み議事録でDocを書き直す（分析レポートなし）
  const sections = await buildMeetingSections(supabase, companyId);
  const content = buildFullDocument(companyName, sections, null);
  await replaceDocumentWithHeadings(docId, content);

  return { docUrl, isNew };
}

/**
 * 分析レポートを生成し、Google Docsを議事録+分析レポートで全面置換する（cron非同期）
 * - cronから呼ばれるため、Promise.raceタイムアウトは不要
 * - generateAnalysisReport内部のAbortController 120秒タイムアウトは維持される
 */
export async function exportAnalysisToDoc(companyId: string): Promise<void> {
  if (!GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error('環境変数 GOOGLE_DRIVE_FOLDER_ID が未設定です');
  }

  const supabase = createServerSupabaseClient();

  // 企業情報を取得
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', companyId)
    .single();

  if (companyError || !company) {
    throw new Error(`企業データが見つかりません (id=${companyId}): ${companyError?.message ?? '該当なし'}`);
  }

  const companyName = company.name as string;

  // Google Doc を検索（存在しなければエラー: cronは新規作成しない）
  const { data: existingDoc } = await supabase
    .from('google_docs')
    .select('doc_id')
    .eq('company_id', companyId)
    .limit(1)
    .maybeSingle();

  if (!existingDoc) {
    throw new Error(`企業「${companyName}」のGoogle Docが未作成です。先に議事録書き出しを実行してください。`);
  }

  const docId = existingDoc.doc_id as string;

  // 全承認済み議事録を取得
  const sections = await buildMeetingSections(supabase, companyId);

  // 要約テキストを収集（分析レポート生成用）
  const meetingEntries = sections.map((s) => ({ date: s.meetingDate, text: s.summaryText }));

  // 分析レポート生成（タイムアウトなし、失敗時はnull）
  const analysisReport = await generateAnalysisReportSafe(companyName, meetingEntries);

  // Docを全面置換（議事録 + 分析レポート）
  const content = buildFullDocument(companyName, sections, analysisReport);
  await replaceDocumentWithHeadings(docId, content);
}

// ---------------------------------------------------------------------------
// 内部ヘルパー: 企業解決
// ---------------------------------------------------------------------------

interface ResolvedCompany {
  companyName: string;
  companyId: string;
}

/**
 * 商談データから企業名・IDを解決する（未登録なら作成）
 */
async function resolveCompany(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  meeting: Record<string, unknown>,
  meetingId: string,
): Promise<ResolvedCompany> {
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

  return { companyName, companyId };
}

// ---------------------------------------------------------------------------
// 内部ヘルパー: Google Doc 解決・作成
// ---------------------------------------------------------------------------

interface ResolvedDoc {
  docId: string;
  docUrl: string;
  isNew: boolean;
}

/**
 * Google Docを検索し、なければ作成する
 */
async function resolveOrCreateDoc(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  companyName: string,
  companyId: string,
): Promise<ResolvedDoc> {
  const { data: existingDoc } = await supabase
    .from('google_docs')
    .select('doc_id, doc_url')
    .eq('company_id', companyId)
    .limit(1)
    .maybeSingle();

  if (existingDoc) {
    return {
      docId: existingDoc.doc_id as string,
      docUrl: existingDoc.doc_url as string,
      isNew: false,
    };
  }

  // サブフォルダ構造対応
  let companyFolderId: string;
  const existingFolder = await findCompanyFolder(companyName, GOOGLE_DRIVE_FOLDER_ID);

  if (existingFolder) {
    companyFolderId = existingFolder.folderId;
    console.log(`既存サブフォルダ発見: ${existingFolder.folderName} (${companyName})`);
  } else {
    companyFolderId = await createFolder(companyName, GOOGLE_DRIVE_FOLDER_ID);
    console.log(`サブフォルダ作成: ${companyName}`);
  }

  // サブフォルダ内でSALES DECK Docを検索（自動修復）
  const foundDoc = await findSalesDeckDoc(companyName, companyFolderId);

  let docId: string;
  let docUrl: string;
  let isNew = false;

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

  return { docId, docUrl, isNew };
}

// ---------------------------------------------------------------------------
// 内部ヘルパー: 議事録セクション構築
// ---------------------------------------------------------------------------

interface MeetingSection {
  meetingDate: string;
  participants: string[];
  source: string;
  summaryText: string;
  index: number;
}

/**
 * 旧フォーマット（■ セクション見出し）の要約を検知する
 * 新フォーマットは【】で囲んだ見出しを使用
 */
function isLegacySummary(summaryText: string): boolean {
  return summaryText.includes('■ ') && !summaryText.includes('【');
}

/**
 * 企業の全承認済み議事録セクションを構築する
 * - 要約なしの商談はスキップ
 * - 旧フォーマットの要約は自動で再生成（最大3件/回）
 */
async function buildMeetingSections(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  companyId: string,
): Promise<MeetingSection[]> {
  const { data: allMeetings } = await supabase
    .from('meetings')
    .select('id, meeting_date, participants, source')
    .eq('company_id', companyId)
    .eq('approval_status', 'approved')
    .order('meeting_date', { ascending: true });

  if (!allMeetings || allMeetings.length === 0) {
    return [];
  }

  const meetingIds = allMeetings.map((m) => m.id as string);
  const { data: summaries } = await supabase
    .from('summaries')
    .select('meeting_id, summary_text')
    .in('meeting_id', meetingIds);

  const summaryMap = new Map<string, string>();
  for (const s of summaries ?? []) {
    summaryMap.set(s.meeting_id as string, s.summary_text as string);
  }

  // 旧フォーマットの要約を自動再生成（最大3件/回、タイムアウト対策）
  let regenerated = 0;
  const MAX_REGEN_PER_RUN = 3;
  for (const m of allMeetings) {
    const existingText = summaryMap.get(m.id as string) ?? '';
    if (!existingText || !isLegacySummary(existingText)) continue;
    if (regenerated >= MAX_REGEN_PER_RUN) break;

    try {
      const { data: transcript } = await supabase
        .from('transcripts')
        .select('full_text')
        .eq('meeting_id', m.id as string)
        .single();

      if (!transcript?.full_text) continue;

      console.log(`旧フォーマット要約を再生成中: meeting=${m.id}`);
      const analysis = await summarizeMeeting(transcript.full_text as string);

      await supabase
        .from('summaries')
        .update({ summary_text: analysis.summary, model_used: 'claude-sonnet-4-20250514' })
        .eq('meeting_id', m.id as string);

      summaryMap.set(m.id as string, analysis.summary);

      // participants/ai_estimated_companyも更新
      await supabase
        .from('meetings')
        .update({
          participants: analysis.participants,
          ai_estimated_company: analysis.estimatedCompany,
        })
        .eq('id', m.id as string);

      regenerated++;
    } catch (err) {
      console.error(`要約再生成に失敗 (meeting=${m.id}):`, err instanceof Error ? err.message : err);
    }
  }

  if (regenerated > 0) {
    console.log(`旧フォーマット要約を${regenerated}件再生成しました`);
  }

  const sections: MeetingSection[] = [];
  let index = 1;
  for (const m of allMeetings) {
    const summaryText = summaryMap.get(m.id as string) ?? '';
    if (!summaryText) continue;

    sections.push({
      meetingDate: m.meeting_date as string,
      participants: (m.participants as string[]) ?? [],
      source: m.source as string,
      summaryText,
      index,
    });
    index++;
  }

  return sections;
}

// ---------------------------------------------------------------------------
// 内部ヘルパー: 分析レポート生成（安全ラッパー）
// ---------------------------------------------------------------------------

/**
 * 分析レポート生成（失敗時はnullを返し、処理を妨げない）
 * cron実行のためPromise.raceタイムアウトは不要。
 * generateAnalysisReport内部のAbortController 120秒タイムアウトは維持される。
 */
async function generateAnalysisReportSafe(
  companyName: string,
  meetings: Array<{ date: string; text: string }>,
): Promise<AnalysisReportResult | null> {
  if (meetings.length === 0) return null;

  try {
    return await generateAnalysisReport(companyName, meetings);
  } catch (err) {
    console.error('分析レポート生成に失敗しました:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 内部ヘルパー: ドキュメント構築
// ---------------------------------------------------------------------------

/**
 * 分析レポートセクションをテキストに変換する（見出しマーカー付き）
 */
function buildAnalysisSection(report: AnalysisReportResult): string {
  return [
    '',
    '【H2】分析サマリ',
    report.executiveSummary,
    '',
    '【H2】重要インサイト',
    report.keyInsights,
    '',
    '【H2】課題・ニーズ分析',
    report.challengesAndNeeds,
    '',
    '【H2】商談タイムライン',
    report.timeline,
    '',
    '【H2】競合状況',
    report.competitiveAnalysis,
    '',
    '【H2】リスク評価',
    report.riskAssessment,
    '',
    '【H2】推奨アクション',
    report.recommendedActions,
  ].join('\n');
}

/**
 * 個別商談セクションをテキストに変換する（見出しマーカー付き）
 */
function buildMeetingSectionText(section: MeetingSection): string {
  const participantsStr = section.participants.join(', ') || '(不明)';

  return [
    `【H2】第${section.index}回 ${section.meetingDate}`,
    `参加者: ${participantsStr}`,
    `ソース: ${section.source}`,
    '',
    section.summaryText,
  ].join('\n');
}

/**
 * 完全なドキュメントを構築する（見出しマーカー付き）
 */
function buildFullDocument(
  companyName: string,
  sections: MeetingSection[],
  analysisReport: AnalysisReportResult | null,
): string {
  const parts: string[] = [];

  // ヘッダー
  parts.push(`【H1】${companyName} 商談インテリジェンスレポート`);
  parts.push('');

  // ドキュメント情報
  parts.push('【H2】ドキュメント情報');
  parts.push(`目的: ${companyName}との営業案件に関する議事録・分析レポート`);

  if (sections.length > 0) {
    const oldest = sections[0].meetingDate;
    const newest = sections[sections.length - 1].meetingDate;
    parts.push(`対象期間: ${oldest} 〜 ${newest}`);
  }

  parts.push(`最終更新: ${new Date().toISOString().split('T')[0]}`);
  parts.push(`商談回数: ${sections.length}回`);

  // 分析レポート（ある場合のみ）
  if (analysisReport) {
    parts.push(buildAnalysisSection(analysisReport));
  }

  // 個別商談記録
  if (sections.length > 0) {
    parts.push('');
    parts.push('【H1】個別商談記録');

    for (const section of sections) {
      parts.push('');
      parts.push(buildMeetingSectionText(section));
    }
  }

  return parts.join('\n');
}
