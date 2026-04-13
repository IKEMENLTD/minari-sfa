// ---------------------------------------------------------------------------
// Netlify Background Function (V1 CommonJS形式)
// ファイル名の "-background" サフィックスにより自動的にBackground Functionとして動作
// → 即座に202を返し、最大15分バックグラウンドで実行
//
// 重要: このファイルはsrc/からのインポートを一切行わない（自己完結型）
// @netlify/plugin-nextjs がルーティングを横取りしないよう、
// CommonJS (.js) で記述し、esbuild単独でバンドルさせる
// ---------------------------------------------------------------------------

const { createClient } = require("@supabase/supabase-js");

// ---------------------------------------------------------------------------
// 定数（src/lib/prompts/meeting-summary.ts からインライン）
// ---------------------------------------------------------------------------

const CLAUDE_SONNET = "claude-sonnet-4-6";

const MEETING_SUMMARY_PROMPT = `あなたは営業会議の議事録から詳細な要約を作成する専門AIです。
議事録の内容を一切省略せず、可能な限り詳細に要約してください。

## summaryフィールドの書き方

### 絶対ルール
- 議事録に含まれる情報は**一切省略しない**
- 具体的な数字、固有名詞、人名、会社名、サービス名は全て正確に記載
- 発言者の重要な発言は「」で直接引用する
- 各セクションに**文字数制限はない** — 必要な情報は全て記載すること

### セクション構成（この順序で必ず記述）
各セクション見出しは【】で囲んでください。情報がない場合は「情報なし」と明記。

【商談概要】
- 日時、参加者（全員のフルネームと所属）、会議の目的・経緯
- 誰からの紹介か、どういう関係性か

【顧客/相手方の背景】
- 相手の会社概要（業種、規模、所在地、設立時期）
- 現在の業務内容、事業戦略
- 使用中のツール、既存の取引先
- 具体的な数値データ（売上、社員数、予算等）

【議論の詳細】
- 議事録の流れに沿って、誰が何を発言したかを詳細に記録
- 重要な発言は「」で直接引用（省略しない）
- 質疑応答の内容を漏れなく記載
- 提案内容、サービス説明の具体的な内容
- 相手からの質問と、それに対する回答

【相手の反応・温度感】
- キーパーソンの具体的な反応（前向き/懸念/保留/否定的）
- 「いいですね」「検討します」等の具体的な発言を引用
- 懸念点・不安に思っている点
- 競合サービスへの言及

【金額・条件・契約】
- 提示金額、単価、見積条件、支払条件
- 予算感、コスト意識に関する発言
- 契約期間、解約条件
- 情報がなければ「金額に関する議論なし」

【ネクストアクション】
- 合意した次のステップを全て列挙（担当者と期日を含む）
- 「〜します」「〜送ります」等の約束事項は全て記録
- フォローアップの方法（メール、LINE、電話等）

【補足・特記事項】
- 競合情報、業界事情、リスク要因
- 雑談で出た重要な情報（人脈、紹介可能性等）
- 今後の展開に影響しそうな情報

### 文体
- ですます調
- 固有名詞は正確に記載
- 数値は一つも漏らさない

## estimatedContactフィールド
- 商談相手の中で最も重要な人物の「名前（会社名）」形式
- 自社メンバーではなく、相手方のキーパーソンを選ぶ

## participantsフィールド
- 「名前（所属）」の形式
- 議事録に登場する全員を記載（発言者全員）

## suggestedNextActionフィールド
- 議事録から読み取れる「自社が次にやるべきアクション」を簡潔に記述
- 複数ある場合は最も重要なものを1つ選ぶ
- 例: 「見積書を再送付」「契約解除規定をLINEで送付」「デモ環境の準備」
- 議事録から次のアクションが読み取れない場合は null

## suggestedNextActionDateフィールド
- 推奨期限をYYYY-MM-DD形式で記述
- 議事録中に具体的な期日の言及があればそれを採用
- 「来週」「月曜」等の相対的な日付は、可能な限り具体的な日付に変換
- 期日の言及がない場合は null

## 回答形式
以下のJSON形式のみ出力（コードブロックで囲まないこと）:
{
  "summary": "...",
  "estimatedContact": "...",
  "participants": [...],
  "suggestedNextAction": "..." or null,
  "suggestedNextActionDate": "YYYY-MM-DD" or null
}`;

// ---------------------------------------------------------------------------
// Claude API 呼び出し
// ---------------------------------------------------------------------------

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const API_TIMEOUT_MS = 600000; // 10分（Background Functionは最大15分実行可能）

/**
 * JSON レスポンスをバリデーションする（zod の代わりに手動チェック）
 */
function validateSummaryResult(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("レスポンスがオブジェクトではありません");
  }
  if (typeof raw.summary !== "string") {
    throw new Error("summary フィールドが文字列ではありません");
  }
  if (typeof raw.estimatedContact !== "string") {
    throw new Error("estimatedContact フィールドが文字列ではありません");
  }
  if (!Array.isArray(raw.participants)) {
    throw new Error("participants フィールドが配列ではありません");
  }
  for (const p of raw.participants) {
    if (typeof p !== "string") {
      throw new Error("participants 配列の要素が文字列ではありません");
    }
  }
  if (raw.suggestedNextAction !== null && typeof raw.suggestedNextAction !== "string") {
    throw new Error("suggestedNextAction フィールドが文字列またはnullではありません");
  }
  if (raw.suggestedNextActionDate !== null && typeof raw.suggestedNextActionDate !== "string") {
    throw new Error("suggestedNextActionDate フィールドが文字列またはnullではありません");
  }
  return {
    summary: raw.summary,
    estimatedContact: raw.estimatedContact,
    participants: raw.participants,
    suggestedNextAction: raw.suggestedNextAction || null,
    suggestedNextActionDate: raw.suggestedNextActionDate || null,
  };
}

async function callClaudeApi(transcript, apiKey, signal) {
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

  const data = await response.json();
  const textContent = data.content.find((c) => c.type === "text");
  if (!textContent) {
    throw new Error("Claude API から有効なテキストレスポンスがありませんでした");
  }

  let text = textContent.text.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  const rawParsed = JSON.parse(text);
  return validateSummaryResult(rawParsed);
}

// ---------------------------------------------------------------------------
// V1 Handler (exports.handler 形式)
// "-background" サフィックスによりNetlifyが自動で202を返し、バックグラウンド実行
// ---------------------------------------------------------------------------

exports.handler = async function (event, context) {
  // ログ用ヘルパー（job_logsテーブルに記録）
  async function logJob(supabase, meetingId, status, message) {
    try {
      if (supabase) {
        await supabase.from("job_logs").insert({
          job_type: "summarize",
          meeting_id: meetingId || null,
          status,
          message: (message || "").substring(0, 2000),
        });
      }
    } catch (e) {
      console.error("job_log 書き込み失敗:", e);
    }
  }

  let supabase = null;
  let meetingId = null;

  try {
    // 認証: 共有シークレットによるヘッダー検証
    const secret = event.headers["x-background-secret"];
    const expectedSecret = process.env.BACKGROUND_FUNCTION_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      console.error("Background Function: 認証失敗", { hasSecret: !!secret, hasExpected: !!expectedSecret });
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
        if (settingData && settingData.value) {
          claudeApiKey = settingData.value;
        }
      } catch (err) {
        console.warn("app_settings からの Claude API キー取得に失敗:", err);
      }
    }

    if (!claudeApiKey) {
      console.error("CLAUDE_API_KEY が設定されていません");
      return { statusCode: 500, body: "CLAUDE_API_KEY が未設定です" };
    }

    const body = JSON.parse(event.body || "{}");
    meetingId = body.meeting_id;

    if (!meetingId || typeof meetingId !== "string") {
      return { statusCode: 400, body: "meeting_id が指定されていません" };
    }

    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await logJob(supabase, meetingId, "started", "要約生成を開始");

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
      console.error(
        `会議 ${meetingId} の文字起こしが見つかりません:`,
        transcriptError ? transcriptError.message : "no data"
      );
      return { statusCode: 404, body: "Transcript not found" };
    }

    const fullText = transcriptData.full_text;
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
        suggested_next_action: result.suggestedNextAction || null,
        suggested_next_action_date: result.suggestedNextActionDate || null,
      });

      if (insertError) {
        console.error(
          `会議 ${meetingId} の要約保存に失敗しました:`,
          insertError.message
        );
        return { statusCode: 500, body: "Summary save failed" };
      }

      // participants 更新（空の場合のみ）
      if (result.participants.length > 0) {
        const { data: meetingData } = await supabase
          .from("meetings")
          .select("participants")
          .eq("id", meetingId)
          .single();

        const currentParticipants = meetingData ? meetingData.participants : null;
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

        if (meetingForDeal && meetingForDeal.deal_id) {
          const { data: dealData } = await supabase
            .from("deals")
            .select("next_action, next_action_date")
            .eq("id", meetingForDeal.deal_id)
            .single();

          if (dealData && !dealData.next_action) {
            const updatePayload = {
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
      await logJob(supabase, meetingId, "completed", `要約生成完了 (${result.summary.length}文字)`);
      return { statusCode: 200, body: "OK" };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Background Function エラー:", errMsg);
    await logJob(supabase, meetingId, "error", errMsg);
    return { statusCode: 500, body: "Internal error" };
  }
};
