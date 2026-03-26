// =============================================================================
// 営業フェーズ定義 - ラズリ SaaS 営業向け
// =============================================================================

export interface SalesPhaseDefinition {
  id: string;
  name: string;
  order: number;
  description: string;
}

/**
 * 営業フェーズ一覧（約30種）
 * ラズリの SaaS 営業プロセスに適したフェーズ定義
 */
export const SALES_PHASES: readonly SalesPhaseDefinition[] = [
  // --- リード獲得・初期接触 ---
  { id: 'phase-01', name: 'リード獲得', order: 1, description: 'マーケティング施策や展示会等でリードを獲得した段階' },
  { id: 'phase-02', name: 'リード精査', order: 2, description: 'リードの有効性・ターゲット適合度を確認' },
  { id: 'phase-03', name: '初回アポ調整', order: 3, description: '初回打ち合わせの日程調整中' },
  { id: 'phase-04', name: '初回接触', order: 4, description: '初回の電話・メール・商談を実施' },

  // --- ヒアリング・課題把握 ---
  { id: 'phase-05', name: 'ヒアリング実施', order: 5, description: '顧客の業務課題・現状をヒアリング' },
  { id: 'phase-06', name: '課題把握', order: 6, description: '顧客の根本課題を特定・整理' },
  { id: 'phase-07', name: 'ニーズ確認', order: 7, description: '顧客のニーズと導入意欲を確認' },
  { id: 'phase-08', name: '決裁者特定', order: 8, description: '意思決定者・決裁フローを把握' },

  // --- 提案・デモ ---
  { id: 'phase-09', name: '提案準備', order: 9, description: '提案資料・デモ環境を準備' },
  { id: 'phase-10', name: '初回提案', order: 10, description: '初回のソリューション提案を実施' },
  { id: 'phase-11', name: 'デモ実施', order: 11, description: '製品デモを実施' },
  { id: 'phase-12', name: 'トライアル提供', order: 12, description: 'トライアル環境を提供し評価中' },
  { id: 'phase-13', name: 'トライアル評価', order: 13, description: 'トライアル結果の評価・フィードバック収集' },

  // --- 見積・交渉 ---
  { id: 'phase-14', name: '見積作成', order: 14, description: '見積書を作成中' },
  { id: 'phase-15', name: '見積提出', order: 15, description: '見積書を提出済み' },
  { id: 'phase-16', name: '価格交渉', order: 16, description: '価格・条件について交渉中' },
  { id: 'phase-17', name: '競合比較', order: 17, description: '競合製品と比較検討されている段階' },
  { id: 'phase-18', name: '社内稟議中', order: 18, description: '顧客社内で稟議・承認プロセス中' },

  // --- 契約 ---
  { id: 'phase-19', name: '契約条件調整', order: 19, description: '契約書の条件を調整中' },
  { id: 'phase-20', name: '契約書送付', order: 20, description: '契約書を送付済み' },
  { id: 'phase-21', name: '契約締結', order: 21, description: '契約を締結' },

  // --- 導入・オンボーディング ---
  { id: 'phase-22', name: '導入準備', order: 22, description: '導入に向けた準備・設定作業' },
  { id: 'phase-23', name: 'キックオフ', order: 23, description: 'プロジェクトキックオフを実施' },
  { id: 'phase-24', name: '初期設定', order: 24, description: 'システムの初期設定・データ移行' },
  { id: 'phase-25', name: 'トレーニング', order: 25, description: 'ユーザートレーニングを実施' },
  { id: 'phase-26', name: '本番稼働', order: 26, description: '本番環境で稼働開始' },

  // --- 運用・拡大 ---
  { id: 'phase-27', name: '運用定着', order: 27, description: '運用が定着し安定利用中' },
  { id: 'phase-28', name: '定期レビュー', order: 28, description: '定期的な利用状況レビューを実施' },
  { id: 'phase-29', name: 'アップセル検討', order: 29, description: '追加機能・プランのアップセルを検討中' },
  { id: 'phase-30', name: '契約更新', order: 30, description: '契約更新の時期・更新交渉中' },

  // --- 特殊ステータス ---
  { id: 'phase-91', name: '保留', order: 91, description: '顧客都合で一時保留中' },
  { id: 'phase-92', name: '失注', order: 92, description: '失注・見送りとなった案件' },
  { id: 'phase-93', name: '解約', order: 93, description: '解約となった案件' },
] as const;

/** API タイムアウト（ミリ秒） */
export const API_TIMEOUT_MS = 120_000;

/** 1ページあたりの取得件数 */
export const DEFAULT_PAGE_SIZE = 50;
