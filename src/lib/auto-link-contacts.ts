// =============================================================================
// 会議参加者の自動コンタクト紐付け & 自動生成
// tldv同期・webhook共通で使用するヘルパー
//
// PhaseC: 「品質ゲートを通った参加者は自動的に contact 作成」モード
//   ゲート条件:
//     1) ノイズ名でない (SPEAKER_01 等)
//     2) 自社メンバーでない (users テーブル名と一致しない)
//     3) 既存contactと名前部分一致なし(曖昧マージ防止)
//     4) 会社名が抽出できる(誤紐付け防止)
//   → これら全て満たすと Tier3 で contact 自動作成 + meeting 紐付け
// =============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { parseParticipantName, namesMatch } from '@/lib/participant-parser';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * ilike LIKE パターンの特殊文字エスケープ(`%`, `_`, `\`)。
 */
export function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => '\\' + m);
}

/**
 * 会社名正規化: 株式会社/㈱/Inc/Ltd 等を除去、空白除去、小文字化。
 */
export function normalizeCompanyName(s: string): string {
  return s
    .replace(/株式会社|（株）|\(株\)|㈱|有限会社|（有）|\(有\)|㈲/gi, '')
    .replace(/\b(inc|ltd|llc|corp|co\.?,?\s*ltd)\b\.?/gi, '')
    .replace(/[\s　]+/g, '')
    .toLowerCase();
}

/**
 * ノイズ判定: 機械生成名・空白のみ・記号のみ等。
 */
export function looksLikeNoise(name: string): boolean {
  const s = name.trim();
  if (s.length < 2) return true;
  if (/^SPEAKER_?\d+$/i.test(s)) return true;
  if (/^(unknown|guest|user|anonymous)_?\d*$/i.test(s)) return true;
  if (/^[?？\-_=*]+$/.test(s)) return true;
  if (/^\d+$/.test(s)) return true;
  return false;
}

/**
 * 名前を正規化(全角/半角スペース除去+小文字化)
 */
function normalizeName(s: string): string {
  return s.replace(/[\s　]+/g, '').toLowerCase();
}

/**
 * 自社メンバー判定: users.name の正規化と一致するか。
 */
export function isInternalMember(name: string, internalNames: Set<string>): boolean {
  return internalNames.has(normalizeName(name));
}

async function fetchInternalNames(supabase: SupabaseClient): Promise<Set<string>> {
  const set = new Set<string>();
  try {
    const { data } = await supabase.from('users').select('name');
    for (const u of (data ?? []) as Array<{ name: string }>) {
      if (u.name) set.add(normalizeName(u.name));
    }
  } catch (err) {
    console.warn('[auto-link] users取得失敗(自社メンバー判定スキップ):', err instanceof Error ? err.message : err);
  }
  return set;
}

/**
 * 自動作成用の assigned_to: admin ロールの最初のユーザーUUID。
 * 取得失敗時は null(その場合 contact 作成スキップ)。
 */
async function fetchAdminUserId(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    return (data?.id as string) ?? null;
  } catch {
    return null;
  }
}

// =============================================================================
// 戻り値型
// =============================================================================
export type AutoLinkResult =
  | { status: 'linked'; contactId: string; reason: 'single_name' | 'company_match' }
  | { status: 'auto_created'; contactId: string; participant: string; companyName: string | null }
  | { status: 'skipped'; reason: 'no_participants' | 'no_parsed' | 'all_internal_or_noise' | 'no_name_match_no_company' | 'ambiguous_no_company' | 'company_normalize_empty' | 'admin_not_found' }
  | { status: 'error'; message: string };

/**
 * 会議の参加者リストから:
 *   - 既存contactと完全一致したら紐付け(linked)
 *   - 既存にいないが会社名抽出できる「新規取引先」と見られる人は自動作成+紐付け(auto_created)
 *   - 曖昧/自社/ノイズはスキップ(skipped, 理由付き)
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

    const parsed = participants.map(parseParticipantName).filter((p) => p.full_name);
    if (parsed.length === 0) return { status: 'skipped', reason: 'no_parsed' };

    // 自社メンバー名 + admin id を事前ロード
    const internalNames = await fetchInternalNames(supabase);
    const adminUserId = await fetchAdminUserId(supabase);

    let ambiguousNoCompany = false;
    let companyNormalizeEmpty = false;
    let allInternalOrNoise = true;

    for (const participant of parsed) {
      // === ゲート1: ノイズ除外 ===
      if (looksLikeNoise(participant.full_name)) {
        console.log(`[auto-link] ${meetingId}: ノイズスキップ "${participant.full_name}"`);
        continue;
      }
      // === ゲート2: 自社メンバー除外 ===
      if (isInternalMember(participant.full_name, internalNames)) {
        console.log(`[auto-link] ${meetingId}: 自社メンバースキップ "${participant.full_name}"`);
        continue;
      }
      allInternalOrNoise = false;

      // 既存contact検索
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, full_name, company_name')
        .ilike('full_name', `%${escapeIlike(participant.full_name)}%`)
        .limit(10);

      const nameMatches = (contacts ?? []).filter((c) =>
        namesMatch(c.full_name as string, participant.full_name)
      );

      // === 既存contactとマッチした場合: 紐付け試行 ===
      if (nameMatches.length > 0) {
        if (participant.company_name) {
          const partCo = normalizeCompanyName(participant.company_name);
          if (partCo.length === 0) {
            companyNormalizeEmpty = true;
            continue;
          }
          const companyMatch = nameMatches.find(
            (c) => c.company_name && normalizeCompanyName(c.company_name as string) === partCo
          );
          if (companyMatch) {
            await supabase.from('meetings').update({ contact_id: companyMatch.id }).eq('id', meetingId);
            console.log(`[auto-link] ${meetingId} → ${companyMatch.full_name}(${companyMatch.company_name}) 会社名一致`);
            return {
              status: 'linked',
              contactId: companyMatch.id as string,
              reason: 'company_match',
            };
          }
          // 同名あるが会社違い → 別人として **新規作成**(自動作成ゲート通過)
          // (PhaseC の核: 同名でも会社違うなら別人とみなして create)
          if (adminUserId) {
            const created = await createContactAndLink(supabase, meetingId, participant, adminUserId);
            if (created) return created;
          }
          continue;
        }
        // 会社名なし: 1件なら紐付け、複数なら曖昧
        if (nameMatches.length === 1) {
          await supabase.from('meetings').update({ contact_id: nameMatches[0].id }).eq('id', meetingId);
          console.log(`[auto-link] ${meetingId} → ${nameMatches[0].full_name} 単一一致`);
          return {
            status: 'linked',
            contactId: nameMatches[0].id as string,
            reason: 'single_name',
          };
        }
        ambiguousNoCompany = true;
        continue;
      }

      // === 既存contactと名前一致なし: 自動作成ゲート ===
      // 必須: 会社名抽出できていること(品質保証)
      if (!participant.company_name) {
        // 会社名無し → 自動作成しない(ユーザーが手動で選ぶ)
        continue;
      }
      if (!adminUserId) {
        return { status: 'skipped', reason: 'admin_not_found' };
      }
      const created = await createContactAndLink(supabase, meetingId, participant, adminUserId);
      if (created) return created;
    }

    if (allInternalOrNoise) return { status: 'skipped', reason: 'all_internal_or_noise' };
    if (companyNormalizeEmpty) return { status: 'skipped', reason: 'company_normalize_empty' };
    if (ambiguousNoCompany) return { status: 'skipped', reason: 'ambiguous_no_company' };
    return { status: 'skipped', reason: 'no_name_match_no_company' };
  } catch (err) {
    console.error(`[auto-link] エラー (会議: ${meetingId}):`, err instanceof Error ? err.message : err);
    return { status: 'error', message: err instanceof Error ? err.message : 'unknown' };
  }
}

/**
 * contact を新規作成して meeting に紐付ける。
 * Tier3(片面識・新規)、source='tldv' でタグ付け。
 */
async function createContactAndLink(
  supabase: SupabaseClient,
  meetingId: string,
  participant: { full_name: string; company_name: string | null },
  adminUserId: string
): Promise<AutoLinkResult | null> {
  try {
    const { data: newContact, error } = await supabase
      .from('contacts')
      .insert({
        full_name: participant.full_name,
        company_name: participant.company_name,
        tier: 3,
        assigned_to: adminUserId,
        source: 'tldv',
        note: '[自動生成] TLDV会議参加者から自動作成',
      })
      .select('id')
      .single();
    if (error || !newContact) {
      console.error(`[auto-link] 自動作成失敗:`, error?.message);
      return null;
    }
    await supabase.from('meetings').update({ contact_id: newContact.id }).eq('id', meetingId);
    console.log(`[auto-link] ${meetingId} → 自動作成 ${participant.full_name}(${participant.company_name})`);
    return {
      status: 'auto_created',
      contactId: newContact.id as string,
      participant: participant.full_name,
      companyName: participant.company_name,
    };
  } catch (e) {
    console.error(`[auto-link] createContactAndLink エラー:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * 後方互換ラッパー: linked or auto_created なら contactId を返す。
 */
export async function autoLinkContactToMeeting(
  meetingId: string,
  participants: string[]
): Promise<string | null> {
  const result = await autoLinkContactToMeetingDetailed(meetingId, participants);
  if (result.status === 'linked' || result.status === 'auto_created') return result.contactId;
  return null;
}
