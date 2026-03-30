export interface GuideStep {
  id: string;
  page: string;
  targetSelector: string;
  mobileTargetSelector?: string;
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  mobilePosition?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'dashboard-intro',
    page: '/',
    targetSelector: 'h1',
    title: 'ダッシュボード',
    description:
      'ここはダッシュボードです。商談の進捗や重要な指標をひと目で把握できます。まずはこの画面で、チーム全体の営業状況を確認してみましょう。',
    position: 'bottom',
  },
  {
    id: 'summary-cards',
    page: '/',
    targetSelector: '[data-guide="summary-cards"]',
    title: 'サマリーカード',
    description:
      '上部のカードには、承認待ちの件数・進行中の案件数・今週の商談数がリアルタイムで表示されます。数字をチェックするだけで、今注力すべきポイントがわかります。',
    position: 'bottom',
  },
  {
    id: 'sidebar-nav',
    page: '/',
    targetSelector: 'aside nav',
    mobileTargetSelector: '[data-guide="mobile-menu"]',
    title: 'ナビゲーション',
    description:
      'サイドバーのメニューから各ページへ移動できます。「商談記録」「取り込み・承認」「案件ボード」の3つが主要な機能です。',
    position: 'right',
    mobilePosition: 'bottom',
  },
  {
    id: 'meetings-intro',
    page: '/meetings',
    targetSelector: 'h1',
    title: '商談記録ページ',
    description:
      'このページでは、承認済みの商談議事録を一覧で確認できます。各商談をクリックすると、議事録の全文やAI要約を閲覧できます。',
    position: 'bottom',
  },
  {
    id: 'meetings-filter',
    page: '/meetings',
    targetSelector: '[data-guide="filter-select"]',
    title: 'フィルタ機能',
    description:
      'このドロップダウンで、承認待ち・承認済み・却下ごとに商談を絞り込めます。目的の商談をすばやく見つけたいときにご活用ください。',
    position: 'bottom',
  },
  {
    id: 'approval-intro',
    page: '/approval',
    targetSelector: 'h1',
    title: '取り込み・承認ページ',
    description:
      'ここでは、PLOUDNOTEから取り込んだ議事録を確認し、承認または却下を行います。承認された議事録だけが商談記録と案件ボードに反映されます。',
    position: 'bottom',
  },
  {
    id: 'approval-fetch',
    page: '/approval',
    targetSelector: '[data-guide="fetch-button"]',
    title: '議事録の取り込み',
    description:
      'このボタンで外部サービスから新しい議事録を取り込みます。取り込み後、下の一覧にカードとして表示されます。ツアー終了後にお試しください。',
    position: 'bottom',
  },
  {
    id: 'deals-intro',
    page: '/deals',
    targetSelector: 'h1',
    title: '案件ボード',
    description:
      'このページでは、承認された商談から自動作成された案件を一覧で管理できます。各カードをクリックして詳細を編集したり、フェーズを変更したりできます。',
    position: 'bottom',
  },
  {
    id: 'deals-sync',
    page: '/deals',
    targetSelector: '[data-guide="sync-button"]',
    title: 'スプレッドシート同期',
    description:
      'このボタンで案件データをGoogleスプレッドシートと同期します。定期的に実行すると、スプレッドシート側でも最新の状態を確認できます。ツアー終了後にお試しください。',
    position: 'bottom',
  },
];
