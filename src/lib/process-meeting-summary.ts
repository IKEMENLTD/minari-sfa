// =============================================================================
// 会議要約の処理本体(PhaseM: Background Function 廃止に伴う直接実行版)
//
// 流れ:
//   1. transcript 取得
//   2. Claude API で要約生成
//   3. summaries テーブルに保存
//   4. participants 補完(空の時のみ)
//   5. PhaseD: 案件自動作成 or 既存紐付け
//   6. PhaseE: AI観察追記(温度感+言及金額+has_movement)
//   7. job_logs 記録
//
// この関数は最大 120秒(Netlify Functions paid timeout)以内に完了する想定。
// 大量議事録の場合は claude.ts 側で truncate 済(25000文字)。
// =============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { summarizeMeeting } from '@/lib/external/claude';
import { shouldAutoCreateDeal, normalizeDealTitle } from '@/lib/auto-create-deal';
import { appendAiObservation, shouldFlipHasMovement, TEMPERATURE_LABEL } from '@/lib/ai-observation';

const AUTO_NOTE_PREFIX = '[自動生成]';

export interface ProcessResult {
  status: 'completed' | 'skipped' | 'error';
  message: string;
  summaryId?: string;
  dealId?: string;
  dealCreated?: boolean;
  aiObservationAppended?: boolean;
}

export async function processMeetingSummary(meetingId: string): Promise<ProcessResult> {
  const supabase = createServerSupabaseClient();

  // 既要約チェック
  const { data: existingSummary } = await supabase
    .from('summaries')
    .select('id')
    .eq('meeting_id', meetingId)
    .limit(1);
  if (existingSummary && existingSummary.length > 0) {
    return { status: 'skipped', message: 'Already summarized' };
  }

  // transcript 取得
  const { data: transcriptData, error: transcriptError } = await supabase
    .from('transcripts')
    .select('full_text')
    .eq('meeting_id', meetingId)
    .limit(1)
    .single();
  if (transcriptError || !transcriptData) {
    return { status: 'error', message: `transcript not found: ${transcriptError?.message ?? 'no data'}` };
  }
  if (!transcriptData.full_text) {
    return { status: 'error', message: 'transcript is empty' };
  }

  // job_logs: 開始
  await supabase.from('job_logs').insert({
    job_type: 'summarize',
    meeting_id: meetingId,
    status: 'started',
    message: 'inline 要約生成を開始',
  });

  // Claude API 呼び出し(env→DB fallback は claude.ts 側で実装済)
  let result;
  try {
    result = await summarizeMeeting(transcriptData.full_text as string);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Claude API失敗';
    await supabase.from('job_logs').insert({
      job_type: 'summarize',
      meeting_id: meetingId,
      status: 'error',
      message: msg.substring(0, 2000),
    });
    return { status: 'error', message: msg };
  }

  // summary 保存
  const { data: insertedSummary, error: summaryInsertErr } = await supabase
    .from('summaries')
    .insert({
      meeting_id: meetingId,
      summary_text: result.summary,
      model_used: 'claude-sonnet-4-6',
      suggested_next_action: result.suggestedNextAction ?? null,
      suggested_next_action_date: result.suggestedNextActionDate ?? null,
      suggested_deal_title: result.suggestedDealTitle ?? null,
    })
    .select('id')
    .single();
  if (summaryInsertErr || !insertedSummary) {
    const msg = summaryInsertErr?.message ?? 'summary insert failed';
    await supabase.from('job_logs').insert({
      job_type: 'summarize',
      meeting_id: meetingId,
      status: 'error',
      message: msg.substring(0, 2000),
    });
    return { status: 'error', message: msg };
  }

  // participants 補完(空の場合のみ)
  if (result.participants.length > 0) {
    const { data: meetingData } = await supabase
      .from('meetings')
      .select('participants')
      .eq('id', meetingId)
      .single();
    const cur = (meetingData?.participants as string[] | null) ?? null;
    if (!cur || cur.length === 0) {
      await supabase.from('meetings').update({ participants: result.participants }).eq('id', meetingId);
    }
  }

  // PhaseD: 案件自動作成 or 既存紐付け
  let linkedDealId: string | null = null;
  let dealCreated = false;
  const { data: meetingForDeal } = await supabase
    .from('meetings')
    .select('deal_id, contact_id')
    .eq('id', meetingId)
    .single();
  linkedDealId = meetingForDeal?.deal_id ?? null;

  if (meetingForDeal) {
    const decision = shouldAutoCreateDeal({
      suggestedDealTitle: result.suggestedDealTitle,
      meetingHasContact: !!meetingForDeal.contact_id,
      meetingHasDeal: !!meetingForDeal.deal_id,
    });

    if (decision.create && meetingForDeal.contact_id) {
      const normTitle = normalizeDealTitle(decision.cleanedTitle);
      const { data: existingDeals } = await supabase
        .from('deals')
        .select('id, title')
        .eq('contact_id', meetingForDeal.contact_id);
      const existingMatch = (existingDeals ?? []).find(
        (d) => normalizeDealTitle(d.title as string) === normTitle,
      );

      if (existingMatch) {
        await supabase.from('meetings').update({ deal_id: existingMatch.id }).eq('id', meetingId);
        linkedDealId = existingMatch.id as string;
        await supabase.from('job_logs').insert({
          job_type: 'summarize',
          meeting_id: meetingId,
          status: 'deal_auto_link_existing',
          message: `deal_id=${existingMatch.id}`,
        });
      } else {
        const { data: adminUser } = await supabase
          .from('users')
          .select('id')
          .eq('role', 'admin')
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .limit(1)
          .single();
        if (adminUser) {
          const dealData: Record<string, unknown> = {
            contact_id: meetingForDeal.contact_id,
            title: decision.cleanedTitle,
            phase: 'proposal_planned',
            assigned_to: adminUser.id,
            note: `${AUTO_NOTE_PREFIX} TLDV会議要約から自動作成 (PhaseM)`,
          };
          if (result.suggestedNextAction) dealData.next_action = result.suggestedNextAction;
          if (result.suggestedNextActionDate) dealData.next_action_date = result.suggestedNextActionDate;
          const { data: newDeal, error: dealErr } = await supabase
            .from('deals')
            .insert(dealData)
            .select('id')
            .single();
          if (dealErr) {
            // UNIQUE violation fallback
            if (dealErr.code === '23505') {
              const { data: race } = await supabase
                .from('deals')
                .select('id')
                .eq('contact_id', meetingForDeal.contact_id)
                .limit(1)
                .single();
              if (race) {
                await supabase.from('meetings').update({ deal_id: race.id }).eq('id', meetingId);
                linkedDealId = race.id as string;
                await supabase.from('job_logs').insert({
                  job_type: 'summarize',
                  meeting_id: meetingId,
                  status: 'deal_auto_link_existing',
                  message: 'race-fallback linked',
                });
              }
            } else {
              await supabase.from('job_logs').insert({
                job_type: 'summarize',
                meeting_id: meetingId,
                status: 'deal_auto_create_failed',
                message: `code=${dealErr.code ?? 'unknown'}`,
              });
            }
          } else if (newDeal) {
            await supabase.from('meetings').update({ deal_id: newDeal.id }).eq('id', meetingId);
            linkedDealId = newDeal.id as string;
            dealCreated = true;
            await supabase.from('job_logs').insert({
              job_type: 'summarize',
              meeting_id: meetingId,
              status: 'deal_auto_created',
              message: `deal_id=${newDeal.id}`,
            });
          }
        }
      }
    }
  }

  // next_action 補完(deal に未設定の場合のみ)
  if (result.suggestedNextAction && linkedDealId) {
    const { data: dealRow } = await supabase
      .from('deals')
      .select('next_action')
      .eq('id', linkedDealId)
      .single();
    if (dealRow && !dealRow.next_action) {
      const update: Record<string, unknown> = { next_action: result.suggestedNextAction };
      if (result.suggestedNextActionDate) update.next_action_date = result.suggestedNextActionDate;
      await supabase.from('deals').update(update).eq('id', linkedDealId);
    }
  }

  // PhaseE: AI観察追記
  let aiObservationAppended = false;
  if (linkedDealId && (result.temperatureSignal || result.mentionedRevenueRange)) {
    const { data: dealRow } = await supabase
      .from('deals')
      .select('status_detail, revenue_note, has_movement')
      .eq('id', linkedDealId)
      .single();
    if (dealRow) {
      const today = new Date().toISOString().slice(0, 10);
      const update: Record<string, unknown> = {};

      if (result.temperatureSignal) {
        const label = TEMPERATURE_LABEL[result.temperatureSignal];
        const newDetail = appendAiObservation(dealRow.status_detail as string | null, today, '温度感', label);
        if (newDetail !== (dealRow.status_detail ?? '')) update.status_detail = newDetail;
      }
      if (result.mentionedRevenueRange) {
        const newRev = appendAiObservation(
          dealRow.revenue_note as string | null,
          today,
          '議事録言及金額',
          result.mentionedRevenueRange,
        );
        if (newRev !== (dealRow.revenue_note ?? '')) update.revenue_note = newRev;
      }
      const flipped = shouldFlipHasMovement(
        (dealRow.has_movement as boolean) ?? false,
        result.temperatureSignal ?? null,
      );
      if (flipped !== null) update.has_movement = flipped;

      if (Object.keys(update).length > 0) {
        await supabase.from('deals').update(update).eq('id', linkedDealId);
        aiObservationAppended = true;
        await supabase.from('job_logs').insert({
          job_type: 'summarize',
          meeting_id: meetingId,
          status: 'deal_ai_observation_appended',
          message: `deal_id=${linkedDealId}`,
        });
      }
    }
  }

  await supabase.from('job_logs').insert({
    job_type: 'summarize',
    meeting_id: meetingId,
    status: 'completed',
    message: `要約生成完了 (${result.summary.length}文字)`,
  });

  return {
    status: 'completed',
    message: `inline 要約生成成功 (${result.summary.length}文字)`,
    summaryId: insertedSummary.id as string,
    dealId: linkedDealId ?? undefined,
    dealCreated,
    aiObservationAppended,
  };
}
