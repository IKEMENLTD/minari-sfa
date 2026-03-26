import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth } from '@/lib/auth';
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
// POST /api/process - 議事録処理トリガー
// TODO: レート制限の実装が必要。Claude API 呼び出しを含む重い処理のため、
// 大量リクエストによるDoS攻撃や意図しない課金を防ぐ仕組みが必要。
// 本番環境では upstash/ratelimit 等のミドルウェアを導入すること。
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse<ApiResult<ProcessResult>>> {
  const authError = validateAuth(request);
  if (authError) return authError as NextResponse<ApiResult<ProcessResult>>;

  try {
    const supabase = createServerSupabaseClient();
    const results: ProcessResult['results'] = [];
    const errors: string[] = [];

    // 1. Jamroll からデータ取得
    let jamrollTranscripts: Awaited<ReturnType<typeof fetchNewTranscripts>> = [];
    try {
      jamrollTranscripts = await fetchNewTranscripts();
    } catch (err) {
      console.error('Jamroll データ取得失敗:', err instanceof Error ? err.message : err);
      errors.push('Jamroll データ取得失敗');
    }

    // 2. PROUD Note からデータ取得
    let proudFiles: Awaited<ReturnType<typeof fetchProudNoteFiles>> = [];
    try {
      proudFiles = await fetchProudNoteFiles();
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
          .select()
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
          .select()
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
