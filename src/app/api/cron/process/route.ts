import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchProudNoteFiles } from '@/lib/external/google-drive';
import { fetchNewTranscripts } from '@/lib/external/jamroll';
import { summarizeMeeting } from '@/lib/external/claude';

// ---------------------------------------------------------------------------
// GET /api/cron/process - 定期自動処理（cron用）
// CRON_SECRET で認証。新しい議事録を検出 → 要約 → 承認待ちとしてDB保存
// ---------------------------------------------------------------------------

const MAX_PER_RUN = 5; // 1回の実行で最大5件処理

export async function GET(request: NextRequest): Promise<NextResponse> {
  // シークレットキーで認証
  const authHeader = request.headers.get('authorization');
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: '認証エラー' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const results: Array<{ source: string; title: string; meetingId: string }> = [];
  const errors: string[] = [];

  // 1. PROUD Note からデータ取得
  try {
    const proudFiles = await fetchProudNoteFiles();

    for (const file of proudFiles) {
      if (results.length >= MAX_PER_RUN) break;

      // 既に処理済みかチェック
      const { data: existing } = await supabase
        .from('meetings')
        .select('id')
        .eq('source', 'proud')
        .eq('source_id', file.id)
        .single();

      if (existing) continue;

      // Claude API で要約
      const analysis = await summarizeMeeting(file.content);

      // 商談レコード作成（承認待ち）
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
        .select('id')
        .single();

      if (meetingError || !meeting) {
        errors.push(`PROUD ${file.title}: 商談作成失敗`);
        continue;
      }

      // 議事録テキスト保存
      await supabase.from('transcripts').insert({
        meeting_id: meeting.id,
        full_text: file.content,
        source: 'proud' as const,
      });

      // 要約保存
      await supabase.from('summaries').insert({
        meeting_id: meeting.id,
        summary_text: analysis.summary,
        model_used: 'claude-sonnet-4-20250514',
      });

      results.push({
        source: 'proud',
        title: file.title,
        meetingId: meeting.id,
      });
    }
  } catch (err) {
    errors.push(`PROUD Note: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Jamroll からデータ取得
  try {
    const transcripts = await fetchNewTranscripts();

    for (const transcript of transcripts) {
      if (results.length >= MAX_PER_RUN) break;

      const { data: existing } = await supabase
        .from('meetings')
        .select('id')
        .eq('source', 'jamroll')
        .eq('source_id', transcript.id)
        .single();

      if (existing) continue;

      const analysis = await summarizeMeeting(transcript.transcript);

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
        .select('id')
        .single();

      if (meetingError || !meeting) {
        errors.push(`Jamroll ${transcript.id}: 商談作成失敗`);
        continue;
      }

      await supabase.from('transcripts').insert({
        meeting_id: meeting.id,
        full_text: transcript.transcript,
        source: 'jamroll' as const,
      });

      await supabase.from('summaries').insert({
        meeting_id: meeting.id,
        summary_text: analysis.summary,
        model_used: 'claude-sonnet-4-20250514',
      });

      results.push({
        source: 'jamroll',
        title: transcript.title,
        meetingId: meeting.id,
      });
    }
  } catch (err) {
    errors.push(`Jamroll: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({
    processed: results.length,
    results,
    errors,
    timestamp: new Date().toISOString(),
  });
}
