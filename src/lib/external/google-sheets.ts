import { getAccessToken } from '@/lib/external/google-drive';
import { API_TIMEOUT_MS } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Google Sheets API 連携 — 顧客管理スプレッドシートの自動更新
// ---------------------------------------------------------------------------

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

const SHEET_COMPANY = '企業マスタ';
const SHEET_MEETINGS = '商談履歴';

// ヘッダー行の定義
const COMPANY_HEADERS = [
  '企業名', 'ティア', '担当者', '商談回数', '最終商談日',
  '現在フェーズ', 'ネクストアクション', 'ステータス要約',
  'Google Docs', 'リスク',
];

const MEETING_HEADERS = [
  '日付', '企業名', '参加者', 'ソース', '要約（先頭200文字）',
  'AI推定企業名', '修正後企業名',
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
  tier: string | null;
  assignedTo: string | null;
  meetingCount: number;
  lastMeetingDate: string | null;
  currentPhase: string | null;
  nextAction: string | null;
  statusSummary: string | null;
  googleDocsUrl: string | null;
  riskNote: string | null;
}

export interface MeetingSheetData {
  meetingDate: string;
  companyName: string;
  participants: string[];
  source: string;
  summaryExcerpt: string;
  aiEstimatedCompany: string;
  correctedCompany: string | null;
}

/**
 * 企業マスタシートを更新（UPSERT: 既存なら上書き、新規なら追加）
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

    const row = [
      company.companyName,
      company.tier ?? '',
      company.assignedTo ?? '',
      company.meetingCount.toString(),
      company.lastMeetingDate ?? '',
      company.currentPhase ?? '',
      company.nextAction ?? '',
      company.statusSummary ?? '',
      company.googleDocsUrl ?? '',
      company.riskNote ?? '',
    ];

    const existingRow = rowMap.get(company.companyName);

    if (existingRow) {
      // 既存行を上書き
      const range = `${SHEET_COMPANY}!A${existingRow}:J${existingRow}`;
      await fetch(
        `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
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
      const range = `${SHEET_COMPANY}!A:J`;
      await fetch(
        `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
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
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 商談履歴シートに1行追加
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
      meeting.meetingDate,
      meeting.companyName,
      meeting.participants.join(', '),
      meeting.source,
      meeting.summaryExcerpt.slice(0, 200),
      meeting.aiEstimatedCompany,
      meeting.correctedCompany ?? '',
    ];

    const range = `${SHEET_MEETINGS}!A:G`;
    await fetch(
      `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
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
