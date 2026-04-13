import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, isAuthError, requireRole } from '@/lib/auth';
import { fetchMeetings, fetchTranscript } from '@/lib/external/tldv';
import { invokeSummarizeBackground } from '@/lib/netlify/background';
import { autoLinkContactToMeeting } from '@/lib/auto-link-contacts';
import type { ApiResult, MeetingRow } from '@/types';

// ---------------------------------------------------------------------------
// 同期結果型
// ---------------------------------------------------------------------------

interface SyncResult {
  synced: number;
  meetings: MeetingRow[];
  errors: string[];
  /** バックグラウンドで要約処理中の会議数 */
  summarizing: number;
  /** コンタクトに自動紐付けされた会議数 */
  autoLinked: number;
  /** デバッグ: tldv APIから取得した会議数 */
  tldvTotal?: number;
  /** デバッグ: 既存の会議数 */
  existingCount?: number;
}

// ---------------------------------------------------------------------------
// POST /api/tldv/sync - TLDV手動同期
// Netlify最適化: 会議+文字起こしのみ保存（10秒以内）
// 要約はNetlify Background Functionに委譲（最大15分）
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResult<SyncResult>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<SyncResult>>;

  const roleError = requireRole(auth, ['admin', 'manager']);
  if (roleError) return roleError as NextResponse<ApiResult<SyncResult>>;

  try {
    const supabase = createServerSupabaseClient();

    // 既存のsource_idを取得
    const { data: existingMeetings, error: existingError } = await supabase
      .from('meetings')
      .select('source_id')
      .eq('source', 'tldv')
      .not('source_id', 'is', null);

    if (existingError) {
      console.error('既存会議の取得に失敗しました:', existingError.message);
      return NextResponse.json(
        { data: null, error: '既存会議データの取得に失敗しました' },
        { status: 500 }
      );
    }

    const existingIds = new Set(
      (existingMeetings ?? [])
        .map((m) => m.source_id as string)
        .filter(Boolean)
    );

    // TLDV APIから全会議を取得
    const allMeetings = await fetchMeetings({ pageSize: 50 });
    const newMeetings = allMeetings.filter((m) => !existingIds.has(m.id));

    console.log(`[tldv-sync] tldv全件: ${allMeetings.length}, 既存: ${existingIds.size}, 新規: ${newMeetings.length}`);
    if (allMeetings.length > 0) {
      console.log(`[tldv-sync] 最初の会議ID: ${allMeetings[0].id}, title: ${allMeetings[0].title}`);
    }

    if (newMeetings.length === 0) {
      return NextResponse.json({
        data: { synced: 0, meetings: [], errors: [], summarizing: 0, autoLinked: 0, tldvTotal: allMeetings.length, existingCount: existingIds.size },
        error: null,
      });
    }

    const syncedMeetings: MeetingRow[] = [];
    const errors: string[] = [];
    const meetingIdsToSummarize: string[] = [];
    let autoLinkedCount = 0;

    for (const tldvMeeting of newMeetings) {
      try {
        // 会議をmeetingsテーブルに挿入
        const { data: meeting, error: meetingError } = await supabase
          .from('meetings')
          .insert({
            meeting_date: tldvMeeting.date,
            source: 'tldv',
            source_id: tldvMeeting.id,
            participants: tldvMeeting.participants,
            title: tldvMeeting.title || null,
            thumbnail_url: tldvMeeting.thumbnail_url || null,
          })
          .select('*')
          .single();

        if (meetingError || !meeting) {
          errors.push(`会議 ${tldvMeeting.id} の保存に失敗: ${meetingError?.message ?? '不明なエラー'}`);
          continue;
        }

        // 参加者名から既存コンタクトを自動紐付け（完全一致のみ）
        try {
          const linkedId = await autoLinkContactToMeeting(
            meeting.id as string,
            tldvMeeting.participants
          );
          if (linkedId) {
            autoLinkedCount++;
            // meeting オブジェクトにも反映
            (meeting as Record<string, unknown>).contact_id = linkedId;
          }
        } catch (linkErr) {
          // 自動紐付け失敗は致命的ではないのでログのみ
          console.warn(
            `[tldv-sync] 会議 ${tldvMeeting.id} の自動紐付けに失敗:`,
            linkErr instanceof Error ? linkErr.message : linkErr
          );
        }

        // 文字起こしを取得して保存
        try {
          const transcript = await fetchTranscript(tldvMeeting.id);

          const { error: transcriptError } = await supabase
            .from('transcripts')
            .insert({
              meeting_id: meeting.id,
              full_text: transcript.text,
              source: 'tldv',
            });

          if (transcriptError) {
            errors.push(`会議 ${tldvMeeting.id} の文字起こし保存に失敗: ${transcriptError.message}`);
          } else {
            // 文字起こし保存成功 → 要約対象に追加
            meetingIdsToSummarize.push(meeting.id as string);
          }
        } catch (transcriptErr) {
          errors.push(`会議 ${tldvMeeting.id} の文字起こし取得に失敗: ${transcriptErr instanceof Error ? transcriptErr.message : '不明なエラー'}`);
        }

        syncedMeetings.push(meeting as MeetingRow);
      } catch (meetingErr) {
        errors.push(`会議 ${tldvMeeting.id} の処理中にエラー: ${meetingErr instanceof Error ? meetingErr.message : '不明なエラー'}`);
      }
    }

    // 要約をNetlify Background Functionに委譲（Background Functionは即座に202を返す）
    for (const meetingId of meetingIdsToSummarize) {
      await invokeSummarizeBackground(meetingId);
    }

    return NextResponse.json({
      data: {
        synced: syncedMeetings.length,
        meetings: syncedMeetings,
        errors,
        summarizing: meetingIdsToSummarize.length,
        autoLinked: autoLinkedCount,
        tldvTotal: allMeetings.length,
        existingCount: existingIds.size,
      },
      error: null,
    });
  } catch (err) {
    console.error('TLDV同期中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: 'TLDV同期中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
