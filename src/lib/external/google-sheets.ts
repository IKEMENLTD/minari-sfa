import { getAccessToken, findCompanyFolder, findSalesDeckDoc, findProudDocInFolder } from '@/lib/external/google-drive';
import { API_TIMEOUT_MS } from '@/lib/constants';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID ?? '';

// ---------------------------------------------------------------------------
// Google Sheets API 連携 — 顧客管理スプレッドシートの自動更新
// ---------------------------------------------------------------------------

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

const SHEET_COMPANY = '企業マスタ';
const SHEET_MEETINGS = '商談履歴';

const COMPANY_HEADERS = [
  '企業名', '現在フェーズ', 'フェーズNo', 'ネクストアクション', '最終商談日',
  '経過日数', '商談回数', '初回商談日', 'ステータス要約',
  'ティア', '担当者', '期待収益', 'SKU数', '分析Doc', 'PLOUD原本', '最終更新',
];

const MEETING_HEADERS = [
  '商談日', '企業名', 'ステータス', '参加者', 'ソース',
  'AI推定企業名', '修正後企業名', '承認日時',
  '要約（先頭300文字）', 'Google Docs',
];

// ---------------------------------------------------------------------------
// 内部ヘルパー
// ---------------------------------------------------------------------------

async function ensureSheets(spreadsheetId: string, token: string, signal: AbortSignal): Promise<void> {
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}?fields=sheets.properties.title`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) throw new Error(`Google Sheets API エラー (${res.status}): シート情報の取得に失敗`);

  const data = (await res.json()) as { sheets: Array<{ properties: { title: string } }> };
  const existingTitles = new Set(data.sheets.map((s) => s.properties.title));

  const requests: Array<Record<string, unknown>> = [];
  if (!existingTitles.has(SHEET_COMPANY)) {
    requests.push({ addSheet: { properties: { title: SHEET_COMPANY } } });
  }
  if (!existingTitles.has(SHEET_MEETINGS)) {
    requests.push({ addSheet: { properties: { title: SHEET_MEETINGS } } });
  }

  if (requests.length > 0) {
    await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
      signal,
    });
  }
}

async function clearAndWrite(
  spreadsheetId: string,
  token: string,
  signal: AbortSignal,
  sheetName: string,
  headers: string[],
  rows: string[][],
): Promise<void> {
  const lastCol = String.fromCharCode(64 + headers.length); // A=65
  const clearRange = `${sheetName}!A2:${lastCol}1000`;

  // 2行目以降をクリア
  await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(clearRange)}:clear`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal,
    },
  );

  // ヘッダー + データを書き込み
  const allRows = [headers, ...rows];
  const writeRange = `${sheetName}!A1:${lastCol}${allRows.length}`;
  await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(writeRange)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: allRows }),
      signal,
    },
  );
}

// ---------------------------------------------------------------------------
// Public API: 全面同期
// ---------------------------------------------------------------------------

export interface SheetSyncResult {
  companyCount: number;
  meetingCount: number;
}

/**
 * Supabase → Google Sheets 全面同期（全面置換方式）
 *
 * - 企業マスタ: 全企業のフェーズ・NA・ステータス等を全行書き換え
 * - 商談履歴: 全承認済み商談を全行書き換え
 * - 冪等（何度実行しても同じ結果）
 * - 過去データの未記入分も全て埋まる
 */
export async function syncAllToSheet(spreadsheetId: string): Promise<SheetSyncResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const token = await getAccessToken(controller.signal);
    await ensureSheets(spreadsheetId, token, controller.signal);

    const supabase = createServerSupabaseClient();
    const now = new Date().toISOString().split('T')[0];

    // ===== 企業マスタ =====

    // 全企業 + deal_statuses + phase + google_docs を取得
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name, tier, assigned_to, expected_revenue, sku_count')
      .order('name');

    const companyRows: string[][] = [];

    for (const company of companies ?? []) {
      const companyId = company.id as string;

      // deal_statuses
      const { data: deal } = await supabase
        .from('deal_statuses')
        .select('current_phase_id, next_action, status_summary, last_meeting_date')
        .eq('company_id', companyId)
        .single();

      // フェーズ名・番号
      let phaseName = '';
      let phaseOrder = '';
      if (deal?.current_phase_id) {
        const { data: phase } = await supabase
          .from('sales_phases')
          .select('phase_name, phase_order')
          .eq('id', deal.current_phase_id as string)
          .single();
        phaseName = (phase?.phase_name as string) ?? '';
        phaseOrder = (phase?.phase_order as number)?.toString() ?? '';
      }

      // 承認済み商談（件数 + 初回日）
      const { data: meetings } = await supabase
        .from('meetings')
        .select('meeting_date')
        .eq('company_id', companyId)
        .eq('approval_status', 'approved')
        .order('meeting_date', { ascending: true });

      const meetingCount = meetings?.length ?? 0;
      const firstDate = (meetings?.[0]?.meeting_date as string) ?? '';

      // Google Docs URL（SALES DECK分析Doc + PLOUD原本の両方を取得）
      let salesDeckDocUrl = '';
      let proudDocUrl = '';

      // DB登録済みのSALES DECK Doc
      const { data: docRow } = await supabase
        .from('google_docs')
        .select('doc_url')
        .eq('company_id', companyId)
        .single();

      if (docRow) {
        salesDeckDocUrl = (docRow.doc_url as string) ?? '';
      }

      // Drive上のサブフォルダを検索してPLOUD原本 + 自動修復
      if (GOOGLE_DRIVE_FOLDER_ID && (company.name as string)) {
        try {
          const folder = await findCompanyFolder(company.name as string, GOOGLE_DRIVE_FOLDER_ID);
          if (folder) {
            // PLOUD原本を検索
            const proudDoc = await findProudDocInFolder(folder.folderId);
            if (proudDoc) proudDocUrl = proudDoc.docUrl;

            // SALES DECK DocがDBにない場合、Driveを検索して自動修復
            if (!salesDeckDocUrl) {
              const sdDoc = await findSalesDeckDoc(company.name as string, folder.folderId);
              if (sdDoc) {
                await supabase.from('google_docs').insert({
                  company_id: companyId,
                  doc_url: sdDoc.docUrl,
                  doc_id: sdDoc.docId,
                  folder: folder.folderId,
                });
                salesDeckDocUrl = sdDoc.docUrl;
                console.log(`自動修復: ${company.name} のDoc URL をDBに登録`);
              }
            }
          }
        } catch {
          // 修復失敗は無視
        }
      }

      const lastMeetingDate = (deal?.last_meeting_date as string) ?? '';
      const rowNum = companyRows.length + 2; // 1-indexed, ヘッダー分+1

      companyRows.push([
        company.name as string,                                              // A: 企業名
        phaseName,                                                           // B: 現在フェーズ
        phaseOrder,                                                          // C: フェーズNo
        (deal?.next_action as string) ?? '',                                 // D: ネクストアクション
        lastMeetingDate,                                                     // E: 最終商談日
        lastMeetingDate ? `=DATEDIF(E${rowNum},TODAY(),"D")` : '', // F: 経過日数
        meetingCount.toString(),                                             // G: 商談回数
        firstDate,                                                           // H: 初回商談日
        (deal?.status_summary as string) ?? '',                              // I: ステータス要約
        (company.tier as string) ?? '',                                      // J: ティア
        (company.assigned_to as string) ?? '',                               // K: 担当者
        (company.expected_revenue as number)?.toString() ?? '',              // L: 期待収益
        (company.sku_count as number)?.toString() ?? '',                     // M: SKU数
        salesDeckDocUrl,                                                     // N: 分析Doc
        proudDocUrl,                                                         // O: PLOUD原本
        now,                                                                 // P: 最終更新
      ]);
    }

    await clearAndWrite(spreadsheetId, token, controller.signal, SHEET_COMPANY, COMPANY_HEADERS, companyRows);

    // ===== 商談履歴 =====

    const statusLabel: Record<string, string> = {
      pending: '承認待ち',
      approved: '承認済み',
      rejected: '却下',
    };

    const { data: allMeetings } = await supabase
      .from('meetings')
      .select('id, meeting_date, participants, source, ai_estimated_company, approval_status, approved_at, company_id')
      .order('meeting_date', { ascending: false });

    const meetingRows: string[][] = [];

    for (const m of allMeetings ?? []) {
      // 企業名
      let companyName = (m.ai_estimated_company as string) ?? '';
      if (m.company_id) {
        const { data: comp } = await supabase
          .from('companies')
          .select('name')
          .eq('id', m.company_id as string)
          .single();
        if (comp) companyName = comp.name as string;
      }

      // 要約
      const { data: summary } = await supabase
        .from('summaries')
        .select('summary_text')
        .eq('meeting_id', m.id as string)
        .single();

      // 修正企業名
      const { data: approval } = await supabase
        .from('approvals')
        .select('corrected_company')
        .eq('meeting_id', m.id as string)
        .single();

      // Google Docs URL
      let docsUrl = '';
      if (m.company_id) {
        const { data: doc } = await supabase
          .from('google_docs')
          .select('doc_url')
          .eq('company_id', m.company_id as string)
          .single();
        docsUrl = (doc?.doc_url as string) ?? '';
      }

      meetingRows.push([
        (m.meeting_date as string) ?? '',                                    // A: 商談日
        companyName,                                                         // B: 企業名
        statusLabel[(m.approval_status as string)] ?? (m.approval_status as string), // C: ステータス
        ((m.participants as string[]) ?? []).join(', '),                     // D: 参加者
        (m.source as string) ?? '',                                          // E: ソース
        (m.ai_estimated_company as string) ?? '',                            // F: AI推定企業名
        (approval?.corrected_company as string) ?? '',                       // G: 修正後企業名
        ((m.approved_at as string) ?? '').split('T')[0],                    // H: 承認日時
        ((summary?.summary_text as string) ?? '').slice(0, 300),            // I: 要約
        docsUrl,                                                             // J: Google Docs
      ]);
    }

    await clearAndWrite(spreadsheetId, token, controller.signal, SHEET_MEETINGS, MEETING_HEADERS, meetingRows);

    return { companyCount: companyRows.length, meetingCount: meetingRows.length };
  } finally {
    clearTimeout(timeoutId);
  }
}
