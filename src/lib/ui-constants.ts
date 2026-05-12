// =============================================================================
// UI 共通定数 - 画面間で挙動を統一する
// =============================================================================

/** トースト/saveMsg の自動消去時間 (ミリ秒) */
export const TOAST_TIMEOUT = {
  /** 成功通知。短めで邪魔にならない */
  success: 3000,
  /** エラー通知。ユーザーが読み切る時間を確保 */
  error: 6000,
  /** 重要な警告(関連件数表示や削除拒否)。長めに表示 */
  warning: 8000,
} as const;

/** フォーカスリング Tailwind クラス(統一) */
export const FOCUS_RING_CLASS = 'focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent';
