import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import {
  CLAUDE_SONNET,
  MEETING_SUMMARY_PROMPT,
  meetingSummarySchema,
} from "../../src/lib/prompts/meeting-summary";

// ---------------------------------------------------------------------------
// Claude API 定義
// ---------------------------------------------------------------------------

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const API_TIMEOUT_MS = 120_000;

interface ClaudeContentBlock {
  type: string;
  text: string;
}

interface ClaudeApiResponse {
  content: ClaudeContentBlock[];
}

// ---------------------------------------------------------------------------
// Claude API 呼び出し
// ---------------------------------------------------------------------------

async function callClaudeApi(
  transcript: string,
  apiKey: string,
  signal: AbortSignal
): Promise<{ summary: string; estimatedContact: string; participants: string[] }> {
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
// Background Function ハンドラ
// Netlify Background Functions は最大15分実行可能
// ---------------------------------------------------------------------------

interface SummarizeRequestBody {
  meeting_id: string;
}

export default async function handler(request: Request): Promise<Response> {
  try {
    // ---------------------------------------------------------------------------
    // 認証: 共有シークレットによるヘッダー検証
    // ---------------------------------------------------------------------------
    const secret = request.headers.get("x-background-secret");
    const expectedSecret = process.env.BACKGROUND_FUNCTION_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      return new Response("Unauthorized", { status: 401 });
    }

    // 環境変数チェック
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const claudeApiKey = process.env.CLAUDE_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("Supabase 環境変数が設定されていません");
      return new Response("Supabase環境変数が未設定です", { status: 500 });
    }
    if (!claudeApiKey) {
      console.error("CLAUDE_API_KEY が設定されていません");
      return new Response("CLAUDE_API_KEY が未設定です", { status: 500 });
    }

    const body = (await request.json()) as SummarizeRequestBody;
    const meetingId = body.meeting_id;

    if (!meetingId || typeof meetingId !== "string") {
      return new Response("meeting_id が指定されていません", { status: 400 });
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
      return new Response("Already summarized", { status: 200 });
    }

    // transcript を取得
    const { data: transcriptData, error: transcriptError } = await supabase
      .from("transcripts")
      .select("full_text")
      .eq("meeting_id", meetingId)
      .limit(1)
      .single();

    if (transcriptError || !transcriptData) {
      console.error(
        `会議 ${meetingId} の文字起こしが見つかりません:`,
        transcriptError?.message
      );
      return new Response("Transcript not found", { status: 404 });
    }

    const fullText = transcriptData.full_text as string;
    if (!fullText) {
      return new Response("Transcript is empty", { status: 404 });
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
      });

      if (insertError) {
        console.error(
          `会議 ${meetingId} の要約保存に失敗しました:`,
          insertError.message
        );
        return new Response("Summary save failed", { status: 500 });
      }

      // participants が取得できた場合、meetings テーブルを更新（既にNULLまたは空の場合のみ）
      if (result.participants.length > 0) {
        const { data: meetingData } = await supabase
          .from("meetings")
          .select("participants")
          .eq("id", meetingId)
          .single();

        const currentParticipants = meetingData?.participants as string[] | null;
        if (!currentParticipants || currentParticipants.length === 0) {
          const { error: updateError } = await supabase
            .from("meetings")
            .update({ participants: result.participants })
            .eq("id", meetingId);

          if (updateError) {
            console.warn(
              `会議 ${meetingId} の参加者更新に失敗しました:`,
              updateError.message
            );
          }
        }
      }

      console.log(`会議 ${meetingId} の要約を正常に生成・保存しました`);
      return new Response("OK", { status: 200 });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    console.error(
      "Background Function エラー:",
      err instanceof Error ? err.message : err
    );
    return new Response("Internal error", { status: 500 });
  }
}

export const config: Config = {
  path: "/.netlify/functions/summarize-meeting-background",
  method: "POST",
};
