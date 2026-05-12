import { API_TIMEOUT_MS } from '@/lib/constants';
import {
  CLAUDE_SONNET,
  MEETING_SUMMARY_PROMPT,
  meetingSummarySchema,
} from '@/lib/prompts/meeting-summary';
import type { MeetingSummaryResult } from '@/types';

// ---------------------------------------------------------------------------
// Claude API 連携
// ---------------------------------------------------------------------------

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

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
 * Claude API キーを取得する(環境変数のみ)。
 * セキュリティ: DBの app_settings からの読み込みは廃止
 *   (service_role 経由で全認証ユーザーがアクセス可能なため平文保存はリスク)。
 * デプロイ時は Netlify 環境変数に CLAUDE_API_KEY を設定すること。
 */
function getClaudeApiKey(): string {
  const envKey = process.env.CLAUDE_API_KEY;
  if (!envKey) {
    throw new Error('環境変数 CLAUDE_API_KEY が設定されていません。Netlify の Environment Variables で設定してください。');
  }
  return envKey;
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
  const apiKey = getClaudeApiKey();

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
    const errorBody = await response.text();
    console.error(`Claude API エラー詳細 (${response.status}):`, errorBody);
    throw new Error(`Claude API エラー (${response.status}): リクエストに失敗しました`);
  }

  const data = (await response.json()) as ClaudeResponse;
  const textContent = data.content.find((c) => c.type === 'text');
  if (!textContent) {
    throw new Error('Claude API から有効なテキストレスポンスがありませんでした');
  }
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
 * 長い議事録を要約可能なサイズに切り詰める。
 * 先頭と末尾を残し、中間を省略する。
 */
function truncateTranscript(text: string, maxChars: number = 25000): string {
  if (text.length <= maxChars) return text;

  const headSize = Math.floor(maxChars * 0.6); // 先頭60%
  const tailSize = Math.floor(maxChars * 0.35); // 末尾35%
  const head = text.slice(0, headSize);
  const tail = text.slice(-tailSize);
  const omitted = text.length - headSize - tailSize;

  return `${head}\n\n[... 中間 ${omitted.toLocaleString()} 文字省略 ...]\n\n${tail}`;
}

/**
 * 会議の議事録を要約し、コンタクト名推定・参加者抽出を行う
 */
export async function summarizeMeeting(
  transcript: string
): Promise<MeetingSummaryResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  const trimmed = truncateTranscript(transcript);

  try {
    const result = await callClaude(
      [{ role: 'user', content: `以下の議事録を分析してください:\n\n${trimmed}` }],
      MEETING_SUMMARY_PROMPT,
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
