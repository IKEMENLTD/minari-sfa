// ---------------------------------------------------------------------------
// Netlify Background Function (V1形式)
// ファイル名の "-background" サフィックスにより自動的にBackground Functionとして動作
// → 即座に202を返し、最大15分バックグラウンドで実行
// 重要: V2 Config exportを使うとV1のbackground判定が無効化されるため使用しない
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import {
  CLAUDE_SONNET,
  MEETING_SUMMARY_PROMPT,
  meetingSummarySchema,
} from "../../src/lib/prompts/meeting-summary";

// V1 handler types (inline to avoid @netlify/functions import issues)
interface HandlerEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body: string | null;
}

interface HandlerContext {
  callbackWaitsForEmptyEventLoop?: boolean;
}

interface HandlerResponse {
  statusCode: number;
  body: string;
}

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const API_TIMEOUT_MS = 120_000;

interface ClaudeContentBlock {
  type: string;
  text: string;
}

interface ClaudeApiResponse {
  content: ClaudeContentBlock[];
}

interface ClaudeSummaryResult {
  summary: string;
  estimatedContact: string;
  participants: string[];
  suggestedNextAction: string | null;
  suggestedNextActionDate: string | null;
}

async function callClaudeApi(
  transcript: string,
  apiKey: string,
  signal: AbortSignal
): Promise<ClaudeSummaryResult> {
  const response = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_SONNET,
      max_tokens: 16384,
      temperature: 0,
      system: MEETING_SUMMARY_PROMPT,
      messages: [
        {
          role: "user",
          content: `以下の議事録を分析してください:\n\n${transcript}`,
        },
      ],
    }),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Claude API エラー詳細 (${response.status}):`, errorBody);
    throw new Error(`Claude API エラー (${response.status})`);
  }

  const data = (await response.json()) as ClaudeApiResponse;
  const textContent = data.content.find((c) => c.type === "text");
  if (!textContent) {
    throw new Error("Claude API から有効なテキストレスポンスがありませんでした");
  }

  let text = textContent.text.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  const rawParsed: unknown = JSON.parse(text);
  return meetingSummarySchema.parse(rawParsed);
}

// ---------------------------------------------------------------------------
// V1 Handler (exports.handler 形式)
// "-background" サフィックスによりNetlifyが自動で202を返し、バックグラウンド実行
// ---------------------------------------------------------------------------

export const handler = async (
  event: HandlerEvent,
  _context: HandlerContext
): Promise<HandlerResponse> => {
  try {
    // 認証: 共有シークレットによるヘッダー検証
    const secret = event.headers["x-background-secret"];
    const expectedSecret = process.env.BACKGROUND_FUNCTION_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      console.error("Background Function: 認証失敗");
      return { statusCode: 401, body: "Unauthorized" };
    }

    // 環境変数チェック
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let claudeApiKey = process.env.CLAUDE_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("Supabase 環境変数が設定されていません");
      return { statusCode: 500, body: "Supabase環境変数が未設定です" };
    }

    // 環境変数に CLAUDE_API_KEY がない場合、app_settings から取得
    if (!claudeApiKey) {
      try {
        const tmpSupabase = createClient(supabaseUrl, supabaseKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: settingData } = await tmpSupabase
          .from("app_settings")
          .select("value")
          .eq("key", "claude_api_key")
          .single();
        if (settingData?.value) {
          claudeApiKey = settingData.value as string;
        }
      } catch (err) {
        console.warn("app_settings からの Claude API キー取得に失敗:", err);
      }
    }

    if (!claudeApiKey) {
      console.error("CLAUDE_API_KEY が設定されていません");
      return { statusCode: 500, body: "CLAUDE_API_KEY が未設定です" };
    }

    const body = JSON.parse(event.body ?? "{}");
    const meetingId = body.meeting_id;

    if (!meetingId || typeof meetingId !== "string") {
      return { statusCode: 400, body: "meeting_id が指定されていません" };
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 既に要約が存在する場合はスキップ
    const { data: existingSummary } = await supabase
      .from("summaries")
      .select("id")
      .eq("meeting_id", meetingId)
      .limit(1);

    if (existingSummary && existingSummary.length > 0) {
      console.log(`会議 ${meetingId} は既に要約済みです。スキップします。`);
      return { statusCode: 200, body: "Already summarized" };
    }

    // transcript を取得
    const { data: transcriptData, error: transcriptError } = await supabase
      .from("transcripts")
      .select("full_text")
      .eq("meeting_id", meetingId)
      .limit(1)
      .single();

    if (transcriptError || !transcriptData) {
      console.error(`会議 ${meetingId} の文字起こしが見つかりません:`, transcriptError?.message);
      return { statusCode: 404, body: "Transcript not found" };
    }

    const fullText = transcriptData.full_text as string;
    if (!fullText) {
      return { statusCode: 404, body: "Transcript is empty" };
    }

    // Claude API で要約生成
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const result = await callClaudeApi(fullText, claudeApiKey, controller.signal);

      // summaries テーブルに保存
      const { error: insertError } = await supabase.from("summaries").insert({
        meeting_id: meetingId,
        summary_text: result.summary,
        model_used: CLAUDE_SONNET,
        suggested_next_action: result.suggestedNextAction ?? null,
        suggested_next_action_date: result.suggestedNextActionDate ?? null,
      });

      if (insertError) {
        console.error(`会議 ${meetingId} の要約保存に失敗しました:`, insertError.message);
        return { statusCode: 500, body: "Summary save failed" };
      }

      // participants 更新（空の場合のみ）
      if (result.participants.length > 0) {
        const { data: meetingData } = await supabase
          .from("meetings")
          .select("participants")
          .eq("id", meetingId)
          .single();

        const currentParticipants = meetingData?.participants as string[] | null;
        if (!currentParticipants || currentParticipants.length === 0) {
          await supabase
            .from("meetings")
            .update({ participants: result.participants })
            .eq("id", meetingId);
        }
      }

      // deal_id 紐付きの場合、次アクション自動設定
      if (result.suggestedNextAction) {
        const { data: meetingForDeal } = await supabase
          .from("meetings")
          .select("deal_id")
          .eq("id", meetingId)
          .single();

        if (meetingForDeal?.deal_id) {
          const { data: dealData } = await supabase
            .from("deals")
            .select("next_action, next_action_date")
            .eq("id", meetingForDeal.deal_id)
            .single();

          if (dealData && !dealData.next_action) {
            const updatePayload: Record<string, string> = {
              next_action: result.suggestedNextAction,
            };
            if (result.suggestedNextActionDate) {
              updatePayload.next_action_date = result.suggestedNextActionDate;
            }
            await supabase
              .from("deals")
              .update(updatePayload)
              .eq("id", meetingForDeal.deal_id);
          }
        }
      }

      console.log(`会議 ${meetingId} の要約を正常に生成・保存しました`);
      return { statusCode: 200, body: "OK" };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    console.error("Background Function エラー:", err instanceof Error ? err.message : err);
    return { statusCode: 500, body: "Internal error" };
  }
};
