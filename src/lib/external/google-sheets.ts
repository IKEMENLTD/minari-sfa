import { getAccessToken } from '@/lib/external/google-drive';
import { API_TIMEOUT_MS } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Google Sheets API 連携 — 顧客管理スプレッドシートの自動更新
// ---------------------------------------------------------------------------

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

const SHEET_COMPANY = '企業マスタ';
const SHEET_MEETINGS = '商談履歴';

// ヘッダー行の定義（CSVインポートと完全一致させること）
const COMPANY_HEADERS = [
  '企業名', '現在フェーズ', 'フェーズNo', 'ネクストアクション', '最終商談日',
  '経過日数', '商談回数', '初回商談日', 'ステータス要約',
  'ティア', '担当者', '期待収益', 'SKU数', 'Google Docs', '最終更新',
];

const MEETING_HEADERS = [
  '商談日', '企業名', '参加者', 'ソース',
  'AI推定企業名', '修正後企業名', '承認日時',
  '要約（先頭300文字）', 'Google Docs',
];

/**
 * スプレッドシートのシート一覧を取得し、必要なシートがなければ作成する
 */
async function ensureSheets(spreadsheetId: string, signal: AbortSignal): Promise<void> {
  const token = await getAccessToken(signal);

  const res = await fetch(`${SHEETS_API}/${spreadsheetId}?fields=sheets.properties.title`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });

  if (!res.ok) {
    throw new Error(`Google Sheets API エラー (${res.status}): シート情報の取得に失敗`);
  }

  const data = (await res.json()) as {
    sheets: Array<{ properties: { title: string } }>;
  };
  const existingTitles = new Set(data.sheets.map((s) => s.properties.title));

  const requests: Array<Record<string, unknown>> = [];

  if (!existingTitles.has(SHEET_COMPANY)) {
    requests.push({ addSheet: { properties: { title: SHEET_COMPANY } } });
  }
  if (!existingTitles.has(SHEET_MEETINGS)) {
    requests.push({ addSheet: { properties: { title: SHEET_MEETINGS } } });
  }

  if (requests.length > 0) {
    const batchRes = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
      signal,
    });

    if (!batchRes.ok) {
      throw new Error(`Google Sheets API エラー (${batchRes.status}): シート作成に失敗`);
    }

    // ヘッダー行を追加
    await writeHeaders(spreadsheetId, token, signal);
  }
}

/**
 * ヘッダー行を書き込む
 */
async function writeHeaders(
  spreadsheetId: string,
  token: string,
  signal: AbortSignal,
): Promise<void> {
  const data = {
    valueInputOption: 'RAW',
    data: [
      {
        range: `${SHEET_COMPANY}!A1`,
        values: [COMPANY_HEADERS],
      },
      {
        range: `${SHEET_MEETINGS}!A1`,
        values: [MEETING_HEADERS],
      },
    ],
  };

  await fetch(`${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
    signal,
  });
}

/**
 * 企業マスタシートの全データを取得し、企業名 → 行番号のマップを返す
 */
async function getCompanyRowMap(
  spreadsheetId: string,
  token: string,
  signal: AbortSignal,
): Promise<Map<string, number>> {
  const range = `${SHEET_COMPANY}!A:A`;
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    },
  );

  if (!res.ok) return new Map();

  const data = (await res.json()) as { values?: string[][] };
  const map = new Map<string, number>();
  for (let i = 1; i < (data.values?.length ?? 0); i++) {
    const name = data.values?.[i]?.[0];
    if (name) map.set(name, i + 1); // 1-indexed row number
  }
  return map;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CompanySheetData {
  companyName: string;
  currentPhase: string | null;
  phaseOrder: number | null;
  nextAction: string | null;
  lastMeetingDate: string | null;
  meetingCount: number;
  firstMeetingDate: string | null;
  statusSummary: string | null;
  tier: string | null;
  assignedTo: string | null;
  expectedRevenue: number | null;
  skuCount: number | null;
  googleDocsUrl: string | null;
}

export interface MeetingSheetData {
  meetingDate: string;
  companyName: string;
  participants: string[];
  source: string;
  aiEstimatedCompany: string;
  correctedCompany: string | null;
  approvedAt: string | null;
  summaryExcerpt: string;
  googleDocsUrl: string | null;
}

/**
 * 企業マスタシートを更新（UPSERT: 既存なら上書き、新規なら追加）
 * カラム: A〜O（15列）
 */
export async function syncCompanyToSheet(
  spreadsheetId: string,
  company: CompanySheetData,
): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    await ensureSheets(spreadsheetId, controller.signal);
    const token = await getAccessToken(controller.signal);
    const rowMap = await getCompanyRowMap(spreadsheetId, token, controller.signal);

    const now = new Date().toISOString().split('T')[0];

    const row = [
      company.companyName,                                          // A: 企業名
      company.currentPhase ?? '',                                   // B: 現在フェーズ
      company.phaseOrder?.toString() ?? '',                         // C: フェーズNo
      company.nextAction ?? '',                                     // D: ネクストアクション
      company.lastMeetingDate ?? '',                                // E: 最終商談日
      '',                                                           // F: 経過日数（数式で自動計算）
      company.meetingCount.toString(),                              // G: 商談回数
      company.firstMeetingDate ?? '',                               // H: 初回商談日
      company.statusSummary ?? '',                                  // I: ステータス要約
      company.tier ?? '',                                           // J: ティア
      company.assignedTo ?? '',                                     // K: 担当者
      company.expectedRevenue?.toString() ?? '',                    // L: 期待収益
      company.skuCount?.toString() ?? '',                           // M: SKU数
      company.googleDocsUrl ?? '',                                  // N: Google Docs
      now,                                                          // O: 最終更新
    ];

    const existingRow = rowMap.get(company.companyName);

    if (existingRow) {
      // 既存行を上書き
      const range = `${SHEET_COMPANY}!A${existingRow}:O${existingRow}`;
      await fetch(
        `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: [row] }),
          signal: controller.signal,
        },
      );
    } else {
      // 新規行を追加
      const range = `${SHEET_COMPANY}!A:O`;
      await fetch(
        `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: [row] }),
          signal: controller.signal,
        },
      );
    }

    // 経過日数の数式を設定（F列）
    const targetRow = existingRow ?? (rowMap.size + 2); // 新規行の場合はmap.size + 2（ヘッダー+既存行数+1）
    const formulaRange = `${SHEET_COMPANY}!F${targetRow}`;
    await fetch(
      `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(formulaRange)}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [[`=IF(E${targetRow}="","",TODAY()-DATEVALUE(E${targetRow}))`]],
        }),
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 商談履歴シートに1行追加
 * カラム: A〜I（9列）
 */
export async function appendMeetingToSheet(
  spreadsheetId: string,
  meeting: MeetingSheetData,
): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    await ensureSheets(spreadsheetId, controller.signal);
    const token = await getAccessToken(controller.signal);

    const row = [
      meeting.meetingDate,                                          // A: 商談日
      meeting.companyName,                                          // B: 企業名
      meeting.participants.join(', '),                              // C: 参加者
      meeting.source,                                               // D: ソース
      meeting.aiEstimatedCompany,                                   // E: AI推定企業名
      meeting.correctedCompany ?? '',                               // F: 修正後企業名
      meeting.approvedAt ?? new Date().toISOString().split('T')[0], // G: 承認日時
      meeting.summaryExcerpt.slice(0, 300),                         // H: 要約（先頭300文字）
      meeting.googleDocsUrl ?? '',                                  // I: Google Docs
    ];

    const range = `${SHEET_MEETINGS}!A:I`;
    await fetch(
      `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [row] }),
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
