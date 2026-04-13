// =============================================================================
// 会議参加者の自動コンタクト紐付け
// tldv同期・webhook共通で使用するヘルパー
// =============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { parseParticipantName, namesMatch } from '@/lib/participant-parser';

/**
 * 会議の参加者リストから既存コンタクトとの完全一致を検索し、
 * 最初に見つかったコンタクトを会議に自動紐付けする。
 *
 * 完全一致（スペースの有無を無視した名前一致）のみ紐付けし、
 * 曖昧なマッチは行わない（安全性優先）。
 *
 * @returns 紐付けしたcontact_id、または紐付けなしの場合null
 */
export async function autoLinkContactToMeeting(
  meetingId: string,
  participants: string[]
): Promise<string | null> {
  if (!participants || participants.length === 0) return null;

  try {
    const supabase = createServerSupabaseClient();

    // 全参加者の名前をパース
    const parsed = participants.map(parseParticipantName).filter((p) => p.full_name);

    if (parsed.length === 0) return null;

    // 全コンタクトを取得（参加者数が少ないので、ilike複数回より効率的）
    // NOTE: コンタクト数が数千件を超える場合はilike検索に切り替えるべき
    const namePatterns = parsed.map((p) => `%${p.full_name}%`);

    // 各参加者名でilike検索
    for (const participant of parsed) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, full_name, company_name')
        .ilike('full_name', `%${participant.full_name}%`)
        .limit(10);

      if (!contacts || contacts.length === 0) continue;

      // 完全一致チェック（スペースの有無を無視）
      const exactMatch = contacts.find((c) => namesMatch(c.full_name, participant.full_name));

      if (exactMatch) {
        // 会社名も一致するか確認（会社名がある場合のみ）
        // 会社名が一致する方を優先
        if (participant.company_name && contacts.length > 1) {
          const companyMatch = contacts.find(
            (c) =>
              namesMatch(c.full_name, participant.full_name) &&
              c.company_name &&
              c.company_name.includes(participant.company_name!)
          );
          if (companyMatch) {
            await supabase
              .from('meetings')
              .update({ contact_id: companyMatch.id })
              .eq('id', meetingId);
            console.log(
              `[auto-link] 会議 ${meetingId} をコンタクト ${companyMatch.full_name}(${companyMatch.company_name}) に自動紐付けしました`
            );
            return companyMatch.id;
          }
        }

        // 会社名なしまたは単一マッチの場合はそのまま紐付け
        await supabase
          .from('meetings')
          .update({ contact_id: exactMatch.id })
          .eq('id', meetingId);
        console.log(
          `[auto-link] 会議 ${meetingId} をコンタクト ${exactMatch.full_name} に自動紐付けしました`
        );
        return exactMatch.id;
      }
    }

    return null;
  } catch (err) {
    console.error(
      `[auto-link] 自動紐付けに失敗しました (会議: ${meetingId}):`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
