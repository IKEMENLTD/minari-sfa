import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchTranscript } from '@/lib/external/tldv';
import { invokeSummarizeBackground } from '@/lib/netlify/background';
import { autoLinkContactToMeeting } from '@/lib/auto-link-contacts';
import type { ApiResult } from '@/types';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Webhook ペイロード Zodスキーマ
// ---------------------------------------------------------------------------

const webhookPayloadSchema = z.object({
  event: z.string(),
  meeting_id: z.string().optional(),
  title: z.string().optional(),
  date: z.string().optional(),
  participants: z.array(z.string()).optional(),
});

type TldvWebhookPayload = z.infer<typeof webhookPayloadSchema>;

// ---------------------------------------------------------------------------
// 署名検証
// ---------------------------------------------------------------------------

function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  // 長さが異なる場合はタイミング攻撃を防ぐためfalseを返す
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

// ---------------------------------------------------------------------------
// TODO [E2]: Webhookリプレイ攻撃防止のため、ペイロードにタイムスタンプを含め、
// 一定時間（例: 5分）以上前のリクエストを拒否する仕組みを将来実装する。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// POST /api/tldv/webhook - TLDV Webhook受信
// Netlify最適化: 会議+文字起こし保存のみ（26秒以内）
// 要約はNetlify Background Functionに委譲（最大15分）
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResult<{ processed: boolean }>>> {
  try {
    const rawBody = await request.text();
    const webhookSecret = process.env.TLDV_WEBHOOK_SECRET;

    // Webhookシークレット必須
    if (!webhookSecret) {
      console.error('TLDV_WEBHOOK_SECRET が設定されていません');
      return NextResponse.json(
        { data: null, error: 'Webhookの設定に問題があります' },
        { status: 500 }
      );
    }

    // 署名検証
    const signature = request.headers.get('x-tldv-signature')
      ?? request.headers.get('x-webhook-signature');
    if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      return NextResponse.json(
        { data: null, error: 'Webhook署名の検証に失敗しました' },
        { status: 403 }
      );
    }

    // Zodバリデーション
    const parseResult = webhookPayloadSchema.safeParse(JSON.parse(rawBody));
    if (!parseResult.success) {
      return NextResponse.json(
        { data: null, error: `ペイロードが不正です: ${parseResult.error.issues.map((e) => e.message).join(', ')}` },
        { status: 400 }
      );
    }
    const payload: TldvWebhookPayload = parseResult.data;

    // TranscriptReadyイベントのみ処理
    if (payload.event !== 'TranscriptReady') {
      return NextResponse.json({
        data: { processed: false },
        error: null,
      });
    }

    if (!payload.meeting_id) {
      return NextResponse.json(
        { data: null, error: 'meeting_id が指定されていません' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // 既に取り込み済みかチェック
    const { data: existing } = await supabase
      .from('meetings')
      .select('id')
      .eq('source', 'tldv')
      .eq('source_id', payload.meeting_id)
      .limit(1);

    if (existing && existing.length > 0) {
      // 冪等性改善: 既存会議のtranscript/summaryが不足していれば補完する
      const existingMeetingId = existing[0].id as string;

      const { data: existingTranscript } = await supabase
        .from('transcripts')
        .select('id')
        .eq('meeting_id', existingMeetingId)
        .limit(1);

      const { data: existingSummary } = await supabase
        .from('summaries')
        .select('id')
        .eq('meeting_id', existingMeetingId)
        .limit(1);

      // transcriptが無い場合は取得して保存
      if ((!existingTranscript || existingTranscript.length === 0) && payload.meeting_id) {
        try {
          const transcript = await fetchTranscript(payload.meeting_id);
          await supabase.from('transcripts').insert({
            meeting_id: existingMeetingId,
            full_text: transcript.text,
            source: 'tldv',
          });

          // transcript保存成功 + summaryが無い → Background Functionで要約
          if (!existingSummary || existingSummary.length === 0) {
            await invokeSummarizeBackground(existingMeetingId);
          }
        } catch (transcriptErr) {
          console.warn('Webhook冪等処理: 文字起こしの取得に失敗しました:', transcriptErr instanceof Error ? transcriptErr.message : transcriptErr);
        }
      } else if (existingTranscript && existingTranscript.length > 0 && (!existingSummary || existingSummary.length === 0)) {
        // transcriptはあるがsummaryがない場合 → Background Functionで要約
        await invokeSummarizeBackground(existingMeetingId);
      }

      return NextResponse.json({
        data: { processed: false },
        error: null,
      });
    }

    // 会議をmeetingsテーブルに挿入
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .insert({
        meeting_date: payload.date ?? new Date().toISOString(),
        source: 'tldv',
        source_id: payload.meeting_id,
        participants: payload.participants ?? [],
        title: payload.title || null,
      })
      .select('*')
      .single();

    if (meetingError || !meeting) {
      console.error('Webhook: 会議の保存に失敗しました:', meetingError?.message);
      return NextResponse.json(
        { data: null, error: '会議の保存に失敗しました' },
        { status: 500 }
      );
    }

    // 参加者名から既存コンタクトを自動紐付け（完全一致のみ）
    try {
      await autoLinkContactToMeeting(
        meeting.id as string,
        (payload.participants ?? [])
      );
    } catch (linkErr) {
      console.warn(
        'Webhook: 自動紐付けに失敗しました:',
        linkErr instanceof Error ? linkErr.message : linkErr
      );
    }

    // 文字起こしを取得して保存
    try {
      const transcript = await fetchTranscript(payload.meeting_id);

      const { error: transcriptError } = await supabase
        .from('transcripts')
        .insert({
          meeting_id: meeting.id,
          full_text: transcript.text,
          source: 'tldv',
        });

      if (transcriptError) {
        console.error('Webhook: 文字起こしの保存に失敗しました:', transcriptError.message);
      } else {
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
          }
        }

        // 文字起こし保存成功 → Background Functionで要約を非同期生成
        await invokeSummarizeBackground(meeting.id as string);
      }
    } catch (transcriptErr) {
      console.error('Webhook: 文字起こしの取得に失敗しました:', transcriptErr instanceof Error ? transcriptErr.message : transcriptErr);
    }

    return NextResponse.json({
      data: { processed: true },
      error: null,
    });
  } catch (err) {
    console.error('Webhook処理中にエラーが発生しました:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { data: null, error: 'Webhook処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
