// =============================================================================
// 営業フェーズ定義 - 内藤さんシステム（5段階）
// =============================================================================

import type { DealPhase, DealProbability } from '@/types';

export interface PhaseDefinition {
  id: DealPhase;
  name: string;
  order: number;
  description: string;
}

export const DEAL_PHASES: readonly PhaseDefinition[] = [
  { id: 'proposal_planned', name: '提案予定', order: 1, description: 'これからアプローチする案件' },
  { id: 'proposal_active', name: '提案中', order: 2, description: '提案済みで動きがある案件' },
  { id: 'waiting', name: '相談待ち', order: 3, description: '相手のボールになっている案件' },
  { id: 'follow_up', name: '継続フォロー', order: 4, description: '定期的にフォローが必要な案件' },
  { id: 'active', name: '稼働中', order: 5, description: '受注済みで稼働中の案件' },
] as const;

export const PHASE_LABEL: Record<DealPhase, string> = {
  proposal_planned: '提案予定',
  proposal_active: '提案中',
  waiting: '相談待ち',
  follow_up: '継続フォロー',
  active: '稼働中',
};

export const PROBABILITY_LABEL: Record<DealProbability, string> = {
  high: '高',
  medium: '中',
  low: '低',
  very_low: '極低',
  unknown: '不明',
};

export const PROBABILITY_COLOR: Record<DealProbability, string> = {
  high: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  low: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/30',
  very_low: 'text-red-400 bg-red-400/10 border-red-400/30',
  unknown: 'text-gray-400 bg-gray-400/10 border-gray-400/30',
};

export const TIER_LABEL: Record<number, string> = {
  1: 'Tier 1 - 相互認知',
  2: 'Tier 2 - 面識あり',
  3: 'Tier 3 - 片面識',
  4: 'Tier 4 - 不明',
};

export const TOOL_LABEL: Record<string, string> = {
  teams: 'Teams',
  zoom: 'Zoom',
  meet: 'Google Meet',
  in_person: '対面',
  phone: '電話',
};

export const INQUIRY_SOURCE_LABEL: Record<string, string> = {
  website: 'HP',
  phone: '電話',
  other: 'その他',
};

export const INQUIRY_STATUS_LABEL: Record<string, string> = {
  new: '未対応',
  in_progress: '対応中',
  completed: '完了',
};

/** API タイムアウト（ミリ秒） */
export const API_TIMEOUT_MS = 600_000; // 10分（Background Functionは最大15分実行可能）

/** TLDV API タイムアウト（ミリ秒） */
export const TLDV_API_TIMEOUT_MS = 30_000;

/** 1ページあたりの取得件数 */
export const DEFAULT_PAGE_SIZE = 50;

/** 次アクション期間ショートカット（日数） */
export const ACTION_DATE_SHORTCUTS = [
  { label: '明日', days: 1 },
  { label: '3日後', days: 3 },
  { label: '1週間後', days: 7 },
  { label: '1ヶ月後', days: 30 },
  { label: '3ヶ月後', days: 90 },
] as const;
