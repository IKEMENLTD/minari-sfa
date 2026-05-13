import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, isAuthError, requireRole } from '@/lib/auth';
import { fetchAllMeetings, fetchTranscript } from '@/lib/external/tldv';
import { processMeetingSummary } from '@/lib/process-meeting-summary';
import { autoLinkContactToMeetingDetailed, type AutoLinkResult } from '@/lib/auto-link-contacts';
import type { ApiResult, MeetingRow } from '@/types';

// ---------------------------------------------------------------------------
// 同期結果型
// ---------------------------------------------------------------------------

type SkipReason = Extract<AutoLinkResult, { status: 'skipped' }>['reason'];

interface SyncResult {
  synced: number;
  meetings: MeetingRow[];
  errors: string[];
  /** バックグラウンドで要約処理中の会議数 */
  summarizing: number;
  /** 既存contactに自動紐付けされた会議数 */
  autoLinked: number;
  /** 新規contact自動作成された会議数(PhaseC) */
  autoCreated: number;
  /** auto-link スキップ理由別の件数(UI で表示) */
  autoLinkSkips: Partial<Record<SkipReason, number>>;
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

    // Netlify Function 同期実行 10秒制約: 全ページ巡回は5ページまで=500件。
    // それ以上ある古い会議は次回同期で取り込み(冪等)。
    const allMeetings = await fetchAllMeetings({ pageSize: 100, maxPages: 5 });
    const newMeetings = allMeetings.filter((m) => !existingIds.has(m.id));

    // さらに per-call 新規件数を 10件で打ち切り(transcript fetch * 10 で 5秒程度想定)。
    // 11件目以降は次回同期で続き取り込み(冪等性で OK)。
    const PER_CALL_LIMIT = 10;
    const truncated = newMeetings.length > PER_CALL_LIMIT;
    const newMeetingsToProcess = newMeetings.slice(0, PER_CALL_LIMIT);

    console.log(`[tldv-sync] tldv全件: ${allMeetings.length}, 既存: ${existingIds.size}, 新規: ${newMeetings.length}, 今回処理: ${newMeetingsToProcess.length}${truncated ? ' (打切)' : ''}`);
    if (allMeetings.length > 0) {
      console.log(`[tldv-sync] 最初の会議ID: ${allMeetings[0].id}, title: ${allMeetings[0].title}`);
    }

    if (newMeetingsToProcess.length === 0) {
      return NextResponse.json({
        data: { synced: 0, meetings: [], errors: [], summarizing: 0, autoLinked: 0, autoCreated: 0, autoLinkSkips: {}, tldvTotal: allMeetings.length, existingCount: existingIds.size },
        error: null,
      });
    }

    const syncedMeetings: MeetingRow[] = [];
    const errors: string[] = [];
    const meetingIdsToSummarize: string[] = [];
    let autoLinkedCount = 0;
    let autoCreatedCount = 0;
    const autoLinkSkips: Partial<Record<SkipReason, number>> = {};

    for (const tldvMeeting of newMeetingsToProcess) {
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
          const linkResult = await autoLinkContactToMeetingDetailed(
            meeting.id as string,
            tldvMeeting.participants
          );
          if (linkResult.status === 'linked') {
            autoLinkedCount++;
            (meeting as Record<string, unknown>).contact_id = linkResult.contactId;
          } else if (linkResult.status === 'auto_created') {
            autoCreatedCount++;
            (meeting as Record<string, unknown>).contact_id = linkResult.contactId;
          } else if (linkResult.status === 'skipped') {
            autoLinkSkips[linkResult.reason] = (autoLinkSkips[linkResult.reason] ?? 0) + 1;
          } else if (linkResult.status === 'error') {
            console.warn(`[tldv-sync] auto-link error:`, linkResult.message);
          }
        } catch (linkErr) {
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

            // 議事録のspeakerを参加者リストにマージ
            const speakerSet = new Set<string>();
            for (const line of transcript.text.split('\n')) {
              const match = line.match(/^([^:]+):/);
              if (match?.[1]?.trim()) speakerSet.add(match[1].trim());
            }
            if (speakerSet.size > 0) {
              const existingNames = (meeting.participants as string[]) ?? [];
              const existingNormalized = existingNames.map(n => n.replace(/[\s/／]/g, ''));
              const newNames = [...existingNames];
              for (const speaker of speakerSet) {
                const speakerNorm = speaker.replace(/[\s/／]/g, '');
                if (!existingNormalized.some(e => e.includes(speakerNorm) || speakerNorm.includes(e))) {
                  newNames.push(speaker);
                }
              }
              if (newNames.length > existingNames.length) {
                await supabase.from('meetings').update({ participants: newNames }).eq('id', meeting.id);
                (meeting as Record<string, unknown>).participants = newNames;
              }
            }
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
      // sync route は最大10件処理、each summarize は背景実行(fire-and-forget)
      // — sync 自体の応答を遅らせないため
      void processMeetingSummary(meetingId).catch((e) => {
        console.error('[sync] inline summarize failed:', e instanceof Error ? e.message : e);
      });
    }

    return NextResponse.json({
      data: {
        synced: syncedMeetings.length,
        meetings: syncedMeetings,
        errors,
        summarizing: meetingIdsToSummarize.length,
        autoLinked: autoLinkedCount,
        autoCreated: autoCreatedCount,
        autoLinkSkips,
        tldvTotal: allMeetings.length,
        existingCount: existingIds.size,
        truncated, // 11件以上残ってる場合 true (再同期で続き取り込みを促す)
        remaining: truncated ? newMeetings.length - PER_CALL_LIMIT : 0,
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
