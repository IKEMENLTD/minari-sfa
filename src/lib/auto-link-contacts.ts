// =============================================================================
// 会議参加者の自動コンタクト紐付け
// tldv同期・webhook共通で使用するヘルパー
// =============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { parseParticipantName, namesMatch } from '@/lib/participant-parser';

/**
 * auto-link結果の詳細(UIでskip理由を可視化するため)。
 */
export type AutoLinkResult =
  | { status: 'linked'; contactId: string; reason: 'single_name' | 'company_match' }
  | { status: 'skipped'; reason: 'no_participants' | 'no_parsed' | 'no_name_match' | 'ambiguous_no_company' | 'company_mismatch' | 'company_normalize_empty' }
  | { status: 'error'; message: string };

/**
 * 会議の参加者リストから既存コンタクトとの完全一致を検索し、
 * 最初に見つかったコンタクトを会議に自動紐付けする。
 *
 * @returns AutoLinkResult (linked / skipped + 理由 / error)
 */
export async function autoLinkContactToMeetingDetailed(
  meetingId: string,
  participants: string[]
): Promise<AutoLinkResult> {
  if (!participants || participants.length === 0) {
    return { status: 'skipped', reason: 'no_participants' };
  }

  try {
    const supabase = createServerSupabaseClient();

    // 全参加者の名前をパース
    const parsed = participants.map(parseParticipantName).filter((p) => p.full_name);

    if (parsed.length === 0) return { status: 'skipped', reason: 'no_parsed' };

    let anyNameMatched = false;
    let companyMismatch = false;
    let ambiguousNoCompany = false;

    // ilike の特殊文字(% _ \)エスケープ - injection / pattern暴走防止
    const escapeIlike = (s: string) => s.replace(/[\\%_]/g, (m) => '\\' + m);

    // 各参加者名で完全一致チェック(安全性優先)
    for (const participant of parsed) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, full_name, company_name')
        .ilike('full_name', `%${escapeIlike(participant.full_name)}%`)
        .limit(10);

      if (!contacts || contacts.length === 0) continue;

      // 氏名スペース無視で名前完全一致するもの
      const nameMatches = contacts.filter((c) => namesMatch(c.full_name, participant.full_name));
      if (nameMatches.length === 0) continue;
      anyNameMatched = true;

      // === 安全性ルール ===
      // 1. 参加者に会社名がある場合: 会社名一致 contact のみ紐付け
      //    → 同姓別人を防ぐ。会社一致が無ければ「紐付けせずスキップ」(誤紐付けより未紐付けが安全)
      // 2. 参加者に会社名が無い場合:
      //    a. 名前一致が1件のみ → 紐付け
      //    b. 複数 → 曖昧なので紐付けせずスキップ(ユーザーが手動選択)
      if (participant.company_name) {
        // 会社名正規化:
        //   - 半角/全角スペース除去
        //   - 株式会社接頭辞バリエーション統一: "株式会社"/"(株)"/"㈱"/"Inc."/"Ltd."/"Co.,Ltd." を除去
        //   - 小文字化
        const normalize = (s: string) => s
          .replace(/株式会社|（株）|\(株\)|㈱|有限会社|（有）|\(有\)|㈲/gi, '')
          .replace(/\b(inc\.?|ltd\.?|llc\.?|corp\.?|co\.?,?\s*ltd\.?)\b/gi, '')
          .replace(/[\s　]+/g, '')
          .toLowerCase();
        const partCo = normalize(participant.company_name);
        if (partCo.length === 0) {
          console.log(`[auto-link] 会議 ${meetingId}: 会社名正規化後が空`);
          continue;
        }
        const companyMatch = nameMatches.find(
          (c) => c.company_name && normalize(c.company_name) === partCo
        );
        if (companyMatch) {
          await supabase
            .from('meetings')
            .update({ contact_id: companyMatch.id })
            .eq('id', meetingId);
          console.log(
            `[auto-link] 会議 ${meetingId} → ${companyMatch.full_name}(${companyMatch.company_name}) 会社名一致紐付け`
          );
          return { status: 'linked', contactId: companyMatch.id, reason: 'company_match' };
        }
        companyMismatch = true;
        console.log(
          `[auto-link] 会議 ${meetingId}: ${participant.full_name} 候補${nameMatches.length}件あるが会社名(${participant.company_name})一致無し`
        );
        continue;
      }

      // 参加者に会社名なし
      if (nameMatches.length === 1) {
        await supabase
          .from('meetings')
          .update({ contact_id: nameMatches[0].id })
          .eq('id', meetingId);
        console.log(
          `[auto-link] 会議 ${meetingId} → ${nameMatches[0].full_name} 単一一致紐付け`
        );
        return { status: 'linked', contactId: nameMatches[0].id, reason: 'single_name' };
      }

      ambiguousNoCompany = true;
      console.log(
        `[auto-link] 会議 ${meetingId}: ${participant.full_name} 候補${nameMatches.length}件で会社名無し、曖昧`
      );
    }

    // 全参加者処理してもlink無し: skipの最具体的理由を返す
    if (companyMismatch) return { status: 'skipped', reason: 'company_mismatch' };
    if (ambiguousNoCompany) return { status: 'skipped', reason: 'ambiguous_no_company' };
    if (!anyNameMatched) return { status: 'skipped', reason: 'no_name_match' };
    return { status: 'skipped', reason: 'no_name_match' };
  } catch (err) {
    console.error(
      `[auto-link] 自動紐付けに失敗しました (会議: ${meetingId}):`,
      err instanceof Error ? err.message : err
    );
    return { status: 'error', message: err instanceof Error ? err.message : 'unknown' };
  }
}

/**
 * 後方互換ラッパー: 既存呼び出しのため contactId or null を返す。
 * 新規呼び出しは `autoLinkContactToMeetingDetailed` を使うこと。
 */
export async function autoLinkContactToMeeting(
  meetingId: string,
  participants: string[]
): Promise<string | null> {
  const result = await autoLinkContactToMeetingDetailed(meetingId, participants);
  return result.status === 'linked' ? result.contactId : null;
}
