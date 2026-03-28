import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, isAuthError, requireRole, validateContentType } from '@/lib/auth';
import { fetchNewTranscripts } from '@/lib/external/jamroll';
import { fetchProudNoteFiles } from '@/lib/external/google-drive';
import { summarizeMeeting } from '@/lib/external/claude';
import type { ApiResult } from '@/types';

// ---------------------------------------------------------------------------
// 処理結果型
// ---------------------------------------------------------------------------

interface ProcessResult {
  processedCount: number;
  results: Array<{
    sourceId: string;
    source: 'jamroll' | 'proud';
    title: string;
    meetingId: string;
    estimatedCompany: string;
    isInternal: boolean;
  }>;
  errors: string[];
}

// ---------------------------------------------------------------------------
// インメモリレート制限
// WARNING: サーバーレス環境（Vercel等）ではプロセス再起動でリセットされるため、
// 本番では必ず Redis / Upstash 等の外部ストアに置き換えること。
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 60_000; // 1分
const RATE_LIMIT_MAX_REQUESTS = 3; // 1分あたり最大3回
const RATE_LIMIT_MAP_MAX_SIZE = 10_000; // メモリリーク防止

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/** 最後にクリーンアップを実行したタイムスタンプ */
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 30_000; // 30秒ごとにクリーンアップ

function checkRateLimit(userId: string): boolean {
  const now = Date.now();

  // メモリリーク防止: 定期的に期限切れエントリを削除（30秒ごと or サイズ超過時）
  if (now - lastCleanup > CLEANUP_INTERVAL_MS || rateLimitMap.size > RATE_LIMIT_MAP_MAX_SIZE) {
    for (const [key, val] of rateLimitMap) {
      if (now > val.resetAt) {
        rateLimitMap.delete(key);
      }
    }
    lastCleanup = now;

    // クリーンアップ後もサイズ超過の場合は全クリア（異常事態）
    if (rateLimitMap.size > RATE_LIMIT_MAP_MAX_SIZE) {
      console.warn(`レート制限Map異常膨張: ${rateLimitMap.size}件。全クリアします。`);
      rateLimitMap.clear();
    }
  }

  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  entry.count++;
  return true;
}

// ---------------------------------------------------------------------------
// POST /api/process - 議事録処理トリガー
// admin / manager のみ実行可能。レート制限あり。
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse<ApiResult<ProcessResult>>> {
  const contentTypeError = validateContentType(request);
  if (contentTypeError) return contentTypeError as NextResponse<ApiResult<ProcessResult>>;

  const authResult = await validateAuth(request);
  if (isAuthError(authResult)) return authResult as NextResponse<ApiResult<ProcessResult>>;

  // ロールチェック: admin または manager のみ
  const roleError = requireRole(authResult, ['admin', 'manager']);
  if (roleError) return roleError as NextResponse<ApiResult<ProcessResult>>;

  // レート制限チェック
  if (!checkRateLimit(authResult.userId)) {
    return NextResponse.json(
      { data: null, error: 'リクエスト回数の上限に達しました。しばらく待ってから再試行してください。' },
      { status: 429 }
    );
  }

  // リクエストbodyの日付範囲バリデーション
  const processSchema = z.object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  }).strict().optional();

  try {
    // bodyが空の場合はundefined、ある場合はパース
    const rawBody = await request.text();
    const parsedJson: unknown = rawBody.length > 0 ? JSON.parse(rawBody) : undefined;
    const bodyResult = processSchema.safeParse(parsedJson);

    if (!bodyResult.success) {
      return NextResponse.json(
        { data: null, error: `リクエストパラメータが不正です: ${bodyResult.error.issues.map((i) => i.message).join(', ')}` },
        { status: 400 }
      ) as NextResponse<ApiResult<ProcessResult>>;
    }

    const from = bodyResult.data?.from;
    const to = bodyResult.data?.to;

    const supabase = createServerSupabaseClient();
    const results: ProcessResult['results'] = [];
    const errors: string[] = [];

    // 1. Jamroll からデータ取得
    let jamrollTranscripts: Awaited<ReturnType<typeof fetchNewTranscripts>> = [];
    try {
      jamrollTranscripts = await fetchNewTranscripts(from, to);
    } catch (err) {
      console.error('Jamroll データ取得失敗:', err instanceof Error ? err.message : err);
      errors.push('Jamroll データ取得失敗');
    }

    // 2. PROUD Note からデータ取得
    let proudFiles: Awaited<ReturnType<typeof fetchProudNoteFiles>> = [];
    try {
      const allProudFiles = await fetchProudNoteFiles();
      // from/to が指定されている場合は日付でフィルタ
      if (from || to) {
        proudFiles = allProudFiles.filter((file) => {
          if (from && file.date < from) return false;
          if (to && file.date > to) return false;
          return true;
        });
      } else {
        proudFiles = allProudFiles;
      }
    } catch (err) {
      console.error('PROUD Note データ取得失敗:', err instanceof Error ? err.message : err);
      errors.push('PROUD Note データ取得失敗');
    }

    // 3. Jamroll 議事録を処理
    for (const transcript of jamrollTranscripts) {
      try {
        // 既に処理済みかチェック
        const { data: existing } = await supabase
          .from('meetings')
          .select('id')
          .eq('source', 'jamroll')
          .eq('source_id', transcript.id)
          .single();

        if (existing) {
          continue; // 処理済みはスキップ
        }

        // Claude API で要約・分析
        const analysis = await summarizeMeeting(transcript.transcript);

        // 商談レコードを作成
        const { data: meeting, error: meetingError } = await supabase
          .from('meetings')
          .insert({
            meeting_date: transcript.date,
            participants: analysis.participants,
            source: 'jamroll' as const,
            source_id: transcript.id,
            is_internal: analysis.isInternal,
            ai_estimated_company: analysis.estimatedCompany,
            approval_status: 'pending' as const,
          })
          .select('id, company_id, meeting_date, participants, source, source_id, is_internal, ai_estimated_company, approval_status, approved_at, created_at')
          .single();

        if (meetingError || !meeting) {
          console.error(`Jamroll ${transcript.id} の商談作成失敗:`, meetingError?.message);
          errors.push(`Jamroll ${transcript.id} の商談作成失敗`);
          continue;
        }

        // 議事録テキストを保存
        await supabase.from('transcripts').insert({
          meeting_id: meeting.id,
          full_text: transcript.transcript,
          source: 'jamroll' as const,
        });

        // 要約を保存
        await supabase.from('summaries').insert({
          meeting_id: meeting.id,
          summary_text: analysis.summary,
          model_used: 'claude-sonnet-4-20250514',
        });

        results.push({
          sourceId: transcript.id,
          source: 'jamroll',
          title: transcript.title,
          meetingId: meeting.id,
          estimatedCompany: analysis.estimatedCompany,
          isInternal: analysis.isInternal,
        });
      } catch (err) {
        console.error(`Jamroll ${transcript.id} の処理失敗:`, err instanceof Error ? err.message : err);
        errors.push(`Jamroll ${transcript.id} の処理失敗`);
      }
    }

    // 4. PROUD Note ファイルを処理
    for (const file of proudFiles) {
      try {
        // 既に処理済みかチェック
        const { data: existing } = await supabase
          .from('meetings')
          .select('id')
          .eq('source', 'proud')
          .eq('source_id', file.id)
          .single();

        if (existing) {
          continue; // 処理済みはスキップ
        }

        // Claude API で要約・分析
        const analysis = await summarizeMeeting(file.content);

        // 商談レコードを作成
        const { data: meeting, error: meetingError } = await supabase
          .from('meetings')
          .insert({
            meeting_date: file.date,
            participants: analysis.participants,
            source: 'proud' as const,
            source_id: file.id,
            is_internal: analysis.isInternal,
            ai_estimated_company: analysis.estimatedCompany,
            approval_status: 'pending' as const,
          })
          .select('id, company_id, meeting_date, participants, source, source_id, is_internal, ai_estimated_company, approval_status, approved_at, created_at')
          .single();

        if (meetingError || !meeting) {
          console.error(`PROUD ${file.id} の商談作成失敗:`, meetingError?.message);
          errors.push(`PROUD ${file.id} の商談作成失敗`);
          continue;
        }

        // 議事録テキストを保存
        await supabase.from('transcripts').insert({
          meeting_id: meeting.id,
          full_text: file.content,
          source: 'proud' as const,
        });

        // 要約を保存
        await supabase.from('summaries').insert({
          meeting_id: meeting.id,
          summary_text: analysis.summary,
          model_used: 'claude-sonnet-4-20250514',
        });

        results.push({
          sourceId: file.id,
          source: 'proud',
          title: file.title,
          meetingId: meeting.id,
          estimatedCompany: analysis.estimatedCompany,
          isInternal: analysis.isInternal,
        });
      } catch (err) {
        console.error(`PROUD ${file.id} の処理失敗:`, err instanceof Error ? err.message : err);
        errors.push(`PROUD ${file.id} の処理失敗`);
      }
    }

    const processResult: ProcessResult = {
      processedCount: results.length,
      results,
      errors,
    };

    return NextResponse.json({ data: processResult, error: null });
  } catch (err) {
    console.error('議事録処理中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: '議事録処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
