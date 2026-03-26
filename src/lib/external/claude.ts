import { z } from 'zod';
import { API_TIMEOUT_MS } from '@/lib/constants';
import { isMockMode } from '@/lib/utils';
import type { MeetingSummaryResult, SalesPhaseJudgment } from '@/types';
import { SALES_PHASES } from '@/lib/constants';

// ---------------------------------------------------------------------------
// レスポンスバリデーションスキーマ
// ---------------------------------------------------------------------------

const meetingSummarySchema = z.object({
  summary: z.string(),
  estimatedCompany: z.string(),
  participants: z.array(z.string()),
  isInternal: z.boolean(),
}).strict();

const salesPhaseJudgmentSchema = z.object({
  phaseId: z.string(),
  nextAction: z.string(),
  statusSummary: z.string(),
}).strict();

// ---------------------------------------------------------------------------
// Claude API 連携
// ---------------------------------------------------------------------------

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
}

/**
 * Claude API にリクエストを送信する
 */
async function callClaude(
  messages: ClaudeMessage[],
  systemPrompt: string,
  signal: AbortSignal
): Promise<string> {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error('環境変数 CLAUDE_API_KEY が設定されていません');
  }

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    }),
    signal,
  });

  if (!response.ok) {
    // エラーレスポンス本文はログにのみ記録し、外部には返さない
    const errorBody = await response.text();
    console.error(`Claude API エラー詳細 (${response.status}):`, errorBody);
    throw new Error(`Claude API エラー (${response.status}): リクエストに失敗しました`);
  }

  const data = (await response.json()) as ClaudeResponse;
  const textContent = data.content.find((c) => c.type === 'text');
  if (!textContent) {
    throw new Error('Claude API から有効なテキストレスポンスがありませんでした');
  }
  return textContent.text;
}

// ---------------------------------------------------------------------------
// モック実装
// ---------------------------------------------------------------------------

function mockSummarizeMeeting(transcript: string): MeetingSummaryResult {
  const len = transcript.length;
  // テキスト長に応じて「それらしい」値を返す
  const isInternal = transcript.includes('社内') || transcript.includes('定例');
  const companyNames = ['株式会社ABC', '合同会社XYZ', '株式会社テスト商事'];
  const estimatedCompany = companyNames[len % companyNames.length];

  const summaryLines = [
    `議事録（${len}文字）の要約です。`,
    isInternal ? '社内ミーティングとして識別されました。' : `${estimatedCompany}との商談内容です。`,
    `主要な議題が${Math.max(1, Math.floor(len / 200))}件確認されました。`,
  ];

  const participantPool = ['田中', '佐藤', '鈴木', '高橋', '渡辺', '山本'];
  const participantCount = Math.min(participantPool.length, Math.max(2, Math.floor(len / 300)));
  const participants = participantPool.slice(0, participantCount);

  return {
    summary: summaryLines.join('\n'),
    estimatedCompany: isInternal ? '(社内)' : estimatedCompany,
    participants,
    isInternal,
  };
}

function mockJudgeSalesPhase(companyMeetings: string[]): SalesPhaseJudgment {
  const totalLen = companyMeetings.reduce((sum, m) => sum + m.length, 0);
  const meetingCount = companyMeetings.length;

  // ミーティング回数に応じてフェーズを進める
  const phaseIndex = Math.min(meetingCount - 1, SALES_PHASES.length - 4);
  const phase = SALES_PHASES[Math.max(0, phaseIndex)];

  const actions = [
    '次回打ち合わせを設定する',
    '提案資料を準備する',
    '見積書を作成する',
    'デモ環境を用意する',
    '契約書を準備する',
  ];
  const nextAction = actions[meetingCount % actions.length];

  return {
    phaseId: phase.id,
    nextAction,
    statusSummary: `${meetingCount}回の商談を実施済み（合計${totalLen}文字）。${phase.name}フェーズと判定。`,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 商談議事録を要約し、企業名推定・参加者抽出・社内判定を行う
 */
export async function summarizeMeeting(
  transcript: string
): Promise<MeetingSummaryResult> {
  if (isMockMode()) {
    return mockSummarizeMeeting(transcript);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const systemPrompt = `あなたは営業商談の議事録を分析するアシスタントです。
以下の JSON 形式で必ず回答してください（他のテキストは含めないでください）:
{
  "summary": "要約テキスト",
  "estimatedCompany": "推定企業名（社内会議の場合は '(社内)'）",
  "participants": ["参加者1", "参加者2"],
  "isInternal": false
}`;

    const result = await callClaude(
      [{ role: 'user', content: `以下の議事録を分析してください:\n\n${transcript}` }],
      systemPrompt,
      controller.signal
    );

    const rawParsed: unknown = JSON.parse(result);
    const validated = meetingSummarySchema.parse(rawParsed);
    return validated;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 企業の商談履歴からフェーズを判定し、次のアクションを提案する
 */
export async function judgeSalesPhase(
  companyMeetings: string[]
): Promise<SalesPhaseJudgment> {
  if (isMockMode()) {
    return mockJudgeSalesPhase(companyMeetings);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const phaseList = SALES_PHASES.map((p) => `${p.id}: ${p.name}`).join('\n');

    const systemPrompt = `あなたは SaaS 営業のフェーズを判定するアシスタントです。
以下のフェーズ一覧から適切なものを選び、JSON 形式で回答してください:

${phaseList}

回答形式（他のテキストは含めないでください）:
{
  "phaseId": "phase-XX",
  "nextAction": "次にやるべきアクション",
  "statusSummary": "現在の状況の要約"
}`;

    const meetingsSummary = companyMeetings
      .map((m, i) => `--- 商談${i + 1} ---\n${m}`)
      .join('\n\n');

    const result = await callClaude(
      [{ role: 'user', content: `以下の商談履歴からフェーズを判定してください:\n\n${meetingsSummary}` }],
      systemPrompt,
      controller.signal
    );

    const rawParsed: unknown = JSON.parse(result);
    const validated = salesPhaseJudgmentSchema.parse(rawParsed);
    return validated;
  } finally {
    clearTimeout(timeoutId);
  }
}
