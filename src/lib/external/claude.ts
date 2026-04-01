import { z } from 'zod';
import { API_TIMEOUT_MS } from '@/lib/constants';
import type { MeetingSummaryResult, SalesPhaseJudgment, AnalysisReportResult } from '@/types';
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

/** Claude APIが文字列または配列で返す場合があるため、配列は改行結合で文字列化する */
const flexString = z.union([z.string(), z.array(z.string()).transform((arr) => arr.join('\n'))]);

const analysisReportSchema = z.object({
  executiveSummary: flexString,
  keyInsights: flexString,
  challengesAndNeeds: flexString,
  timeline: flexString,
  competitiveAnalysis: flexString,
  riskAssessment: flexString,
  recommendedActions: flexString,
});

// ---------------------------------------------------------------------------
// Claude API 連携
// ---------------------------------------------------------------------------

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_SONNET = 'claude-sonnet-4-20250514';
const CLAUDE_HAIKU = 'claude-haiku-4-5-20251001';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
}

interface ClaudeOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Claude API にリクエストを送信する
 */
async function callClaude(
  messages: ClaudeMessage[],
  systemPrompt: string,
  signal: AbortSignal,
  options?: ClaudeOptions
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
      model: options?.model ?? CLAUDE_SONNET,
      max_tokens: options?.maxTokens ?? 16384,
      temperature: options?.temperature ?? 1,
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
    const systemPrompt = `あなたは法人営業の議事録作成専門AIです。
この要約は後工程でNotebookLMに投入してスライド生成に使用されます。

## summaryフィールドの書き方

### セクション構成（この順序で必ず記述）
各セクション見出しは【】で囲んでください。情報がない場合は「情報なし」と明記。

【商談概要】
- 日時、参加者（全員のフルネームと所属）、会議の目的

【顧客の現状と課題】
- 現在の業務フロー、使用中のツール
- 具体的な課題（数値を含む：SKU数、作業時間、コスト等）

【議論の詳細】
- 誰が何を発言したか、重要な発言は「」で直接引用
- 質疑応答の内容を漏れなく記載
- 提案内容の具体的な説明

【商談の温度感・反応】
- 顧客キーパーソンの反応（前向き/懸念/保留）
- 具体的な懸念事項、競合他社の状況

【金額・条件】
- 提示金額、単価、見積条件、予算感
- 情報がなければ「金額に関する議論なし」

【ネクストアクション】
- 合意した次のステップ（担当者と期日を含む）
- 宿題事項（自社側・顧客側）

【補足・特記事項】
- 競合情報、業界事情、リスク要因

### 文体
- ですます調
- 固有名詞は正確に記載
- 数値は一つも漏らさない
- 1セクション400文字以内を目安に、重要な情報は漏らさない

## participantsフィールド
- 「名前（所属）」の形式
- 議事録に登場する全員を記載

## 回答形式
以下のJSON形式のみ出力（コードブロックで囲まないこと）:
{
  "summary": "...",
  "estimatedCompany": "...",
  "participants": [...],
  "isInternal": false
}`;

    const result = await callClaude(
      [{ role: 'user', content: `以下の議事録を分析してください:\n\n${transcript}` }],
      systemPrompt,
      controller.signal,
      { temperature: 0 }
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
      controller.signal,
      { model: CLAUDE_HAIKU, maxTokens: 1024, temperature: 0 }
    );

    const rawParsed: unknown = JSON.parse(result);
    const validated = salesPhaseJudgmentSchema.parse(rawParsed);
    return validated;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 企業の全商談履歴から分析レポートを自動生成する
 * NotebookLM相当の分析をClaude APIで実行し、Google Docsに統合する
 */
export async function generateAnalysisReport(
  companyName: string,
  companyMeetings: Array<{ date: string; text: string }>
): Promise<AnalysisReportResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const systemPrompt = `あなたは法人営業の戦略分析AIです。
企業との全商談履歴を分析し、スライド生成に最適化された分析レポートを作成してください。

## 入力
複数の商談要約が時系列順に提供されます。各要約には商談日が付与されています。

## 出力ルール
- 体言止めで記述（スライド転記を前提）
- 箇条書き・番号付きリストを活用
- 具体的な数値・固有名詞・日付は漏らさない
- 推測には「（推定）」と明記
- 1セクション400文字以内

## 回答形式（JSON のみ出力。マークダウンのコードブロックで囲まないこと）
{
  "executiveSummary": "案件全体の現状を200-400字で要約。受注確度、進捗度合い、重要判断ポイントを含む",
  "keyInsights": "商談から読み取れる重要な洞察を箇条書きで5-7項目。各項目に根拠を付与",
  "challengesAndNeeds": "顧客の課題とニーズを優先度順に構造化。【課題名】: 詳細 の形式",
  "timeline": "全商談を時系列で整理。各商談の日付、主要議題、進展・停滞を簡潔に",
  "competitiveAnalysis": "判明している競合情報を整理。競合名、強み・弱み、自社との差別化ポイント。情報がなければ「競合情報なし -- 次回ヒアリング推奨」",
  "riskAssessment": "失注・遅延・競合リスクを列挙。各リスクに影響度（高=受注に直結/中=スケジュール影響/低=対処可能）と根拠を明記",
  "recommendedActions": "次に取るべき行動を優先度順に3-5項目。【優先度: 高/中/低】アクション → 期限目安"
}`;

    const meetingsSummary = companyMeetings
      .map((m, i) => `--- 商談${i + 1}（${m.date}） ---\n${m.text}`)
      .join('\n\n');

    const result = await callClaude(
      [{ role: 'user', content: `以下は「${companyName}」との全商談履歴です。包括的な分析レポートを作成してください:\n\n${meetingsSummary}` }],
      systemPrompt,
      controller.signal,
      { maxTokens: 16384, temperature: 0 }
    );

    const rawParsed: unknown = JSON.parse(result);
    const validated = analysisReportSchema.parse(rawParsed);
    return validated;
  } finally {
    clearTimeout(timeoutId);
  }
}
