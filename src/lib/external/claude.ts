import { API_TIMEOUT_MS } from '@/lib/constants';
import {
  CLAUDE_SONNET,
  MEETING_SUMMARY_PROMPT,
  meetingSummarySchema,
} from '@/lib/prompts/meeting-summary';
import { createServerSupabaseClient } from '@/lib/supabase/server';
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
 * Claude API キーを取得する。
 * 1. 環境変数 CLAUDE_API_KEY を優先
 * 2. 未設定の場合は app_settings テーブルから読み取り
 */
async function getClaudeApiKey(): Promise<string> {
  const envKey = process.env.CLAUDE_API_KEY;
  if (envKey) return envKey;

  try {
    const supabase = createServerSupabaseClient();
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'claude_api_key')
      .single();

    if (data?.value) return data.value as string;
  } catch (err) {
    console.warn('app_settings からの Claude API キー取得に失敗:', err instanceof Error ? err.message : err);
  }

  throw new Error('Claude API キーが設定されていません。環境変数または設定画面で設定してください。');
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
  const apiKey = await getClaudeApiKey();

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
 * 会議の議事録を要約し、コンタクト名推定・参加者抽出を行う
 */
export async function summarizeMeeting(
  transcript: string
): Promise<MeetingSummaryResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const result = await callClaude(
      [{ role: 'user', content: `以下の議事録を分析してください:\n\n${transcript}` }],
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
