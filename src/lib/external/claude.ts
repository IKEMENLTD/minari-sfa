import { API_TIMEOUT_MS } from '@/lib/constants';
import {
  CLAUDE_SONNET,
  MEETING_SUMMARY_PROMPT,
  meetingSummarySchema,
} from '@/lib/prompts/meeting-summary';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { decryptSetting, isEncryptedValue } from '@/lib/crypto/settings-cipher';
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
 *   1. env `CLAUDE_API_KEY` を優先
 *   2. 無ければ app_settings から `claude_api_key` を取得(AES-256-GCM 復号)
 *   3. それも無ければエラー
 *
 * PhaseB で UI設定対応: admin が /settings から平文入力 → 暗号化保存 →
 * env 設定不要で運用可能。env を併用すれば env が優先(ホットフィックス用)。
 */
async function getClaudeApiKey(): Promise<string> {
  // ⚠️ trim() で末尾改行/空白除去(Netlify env への copy-paste 事故対策)
  const envKey = process.env.CLAUDE_API_KEY?.trim();
  if (envKey) return envKey;

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'claude_api_key')
      .single();
    if (error || !data?.value) {
      throw new Error('app_settings に claude_api_key が登録されていません');
    }
    const raw = (data.value as string).trim();
    if (isEncryptedValue(raw)) {
      return decryptSetting(raw).trim();
    }
    console.warn('[claude] claude_api_key が平文で保存されています。/settings から再保存して暗号化してください。');
    return raw;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Claude API キーが取得できません(env CLAUDE_API_KEY 未設定 + app_settings: ${detail})`);
  }
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
      max_tokens: options?.maxTokens ?? 16384, // 詳細要約に必要
      temperature: options?.temperature ?? 1,
      system: systemPrompt,
      messages,
    }),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Claude API エラー詳細 (${response.status}):`, errorBody);
    // Anthropic のエラー body を 500文字まで含めて投げる(job_logs に保存される)
    const truncatedBody = errorBody.substring(0, 500).replace(/\s+/g, ' ');
    throw new Error(`Claude API エラー (${response.status}): ${truncatedBody}`);
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
// 詳細要約のため 25000 文字(BG function で処理するので 15分まで余裕)
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
