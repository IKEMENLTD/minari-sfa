import { z } from 'zod';
import { API_TIMEOUT_MS } from '@/lib/constants';
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
      max_tokens: 16384,
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
  // マークダウンのコードブロック(```json ... ```)を除去
  let text = textContent.text.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return text;
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const systemPrompt = `あなたはSaaS営業チームの商談議事録から、完全な議事録レポートを作成する専門アシスタントです。
この要約は後工程でNotebookLMに投入してスライド生成に使用されます。情報の欠落は許されません。

## summaryフィールドの書き方（最重要）

### 原則
- 議事録の内容を**一切省略せず**、構造化された詳細レポートとして出力すること
- 文字数の目安: 元の議事録の30〜50%程度。短い会議でも最低1000文字、長い会議は10000文字以上でもOK
- 第三者がこのレポートだけで商談の全貌を把握できるレベルの詳細さが必要

### 必須セクション（この順序で必ず書くこと）

**■ 商談概要**
- 日時、参加者（全員のフルネームと所属）、会議の目的・アジェンダ

**■ 顧客の現状と課題**
- 現在の業務フロー、使用中のツール・システム
- 具体的な課題・痛み（数値を含む：SKU数、作業時間、コスト等）
- 過去の取り組み・失敗した施策があれば

**■ 議論の詳細**
- 誰が何を発言したか、重要な発言は「」で直接引用
- 質疑応答の内容を漏れなく記載
- 提案した製品・サービスの具体的な説明内容
- デモやPoCの内容があれば詳細に

**■ 商談の温度感・反応**
- 顧客のキーパーソンの反応（前向き/懸念/保留など）
- 具体的な懸念事項や反対意見
- 競合他社の状況（名前、利用中のサービス、乗り換え検討理由）

**■ 金額・条件**
- 提示した金額、単価、見積条件
- 顧客の予算感、値引き交渉の有無
- 契約形態（月額/年額）、契約期間

**■ ネクストアクション**
- 合意した次のステップ（全て列挙）
- 各アクションの担当者と期日
- 次回ミーティングの予定日時
- 宿題事項（自社側・顧客側それぞれ）

**■ タイムライン・ロードマップ**
- 導入までのスケジュール感
- PoC/トライアル期間
- 本番稼働予定時期

**■ 補足・特記事項**
- 競合情報、業界特有の事情
- 社内共有すべき重要な気づき
- リスク要因

### 文体
- ですます調で丁寧に
- 段落を適切に分けて読みやすく
- 固有名詞（企業名、製品名、人名、部署名）は正確に記載
- 金額・数量・期日・パーセンテージなどの数値は一つも漏らさない

## participantsフィールド
- 「名前（所属）」の形式（例: "田中（ラズリ）"）
- 議事録に登場する全員を記載
- 所属が不明な場合は名前のみ

## 回答形式
以下のJSON形式のみ出力してください（マークダウンのコードブロックで囲まないこと）:
{
  "summary": "詳細な議事録レポート",
  "estimatedCompany": "商談相手の企業名（社内会議の場合は '(社内)'）",
  "participants": ["名前（所属）", "名前（所属）"],
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
