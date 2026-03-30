export interface GuideStep {
  id: string;
  page: string;
  targetSelector: string;
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'auto';
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'dashboard-intro',
    page: '/',
    targetSelector: 'h1',
    title: 'SALES DECK へようこそ',
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
      '上部の4つのカードには、承認待ちの件数・進行中の案件数・今月の商談数・成約率がリアルタイムで表示されます。数字をチェックするだけで、今チームが注力すべきポイントがわかります。',
    position: 'bottom',
  },
  {
    id: 'sidebar-nav',
    page: '/',
    targetSelector: 'nav',
    title: 'ナビゲーション',
    description:
      'サイドバーのメニューから各ページへ移動できます。モバイルの場合は左上のメニューボタンをタップしてください。商談記録・取り込み承認・案件ボードの3つが主要な機能です。',
    position: 'right',
  },
  {
    id: 'meetings-intro',
    page: '/meetings',
    targetSelector: 'h1',
    title: '商談記録ページ',
    description:
      'このページでは、承認済みの商談議事録を一覧で確認できます。各商談の詳細をクリックすると、議事録の全文や要約を閲覧できます。',
    position: 'bottom',
  },
  {
    id: 'meetings-filter',
    page: '/meetings',
    targetSelector: '[data-guide="filter-select"]',
    title: 'フィルタ機能',
    description:
      'このドロップダウンで、担当者やステータスごとに商談を絞り込めます。目的の商談をすばやく見つけたいときにご活用ください。',
    position: 'bottom',
  },
  {
    id: 'approval-intro',
    page: '/approval',
    targetSelector: 'h1',
    title: '取り込み・承認ページ',
    description:
      'ここでは、PLOUDNOTEから取り込んだ議事録を確認し、承認または却下を行います。承認された議事録だけが商談記録に反映されます。',
    position: 'bottom',
  },
  {
    id: 'approval-fetch',
    page: '/approval',
    targetSelector: '[data-guide="fetch-button"]',
    title: '議事録の取り込み',
    description:
      'このボタンをクリックすると、PLOUDNOTEの最新の議事録を取り込みます。取り込み後、下の一覧にカードとして表示されますので、内容を確認してください。',
    position: 'bottom',
  },
  {
    id: 'approval-cards',
    page: '/approval',
    targetSelector: '[data-guide="approval-cards"]',
    title: '承認カードの操作',
    description:
      '各カードの内容を確認し、「承認」または「却下」ボタンで処理してください。承認すると商談記録に反映され、却下すると一覧から除外されます。必要に応じてメモを添えることもできます。',
    position: 'top',
  },
  {
    id: 'deals-intro',
    page: '/deals',
    targetSelector: 'h1',
    title: '案件ボード',
    description:
      'このページでは、案件をステージごとにカンバン形式で管理できます。各カードをドラッグ&ドロップしてステージを変更したり、クリックして詳細を編集したりできます。',
    position: 'bottom',
  },
  {
    id: 'deals-sync',
    page: '/deals',
    targetSelector: '[data-guide="sync-button"]',
    title: 'スプレッドシート同期',
    description:
      'このボタンをクリックすると、案件データをGoogleスプレッドシートと同期します。スプレッドシート側で更新した内容も反映されますので、定期的に同期を実行してください。',
    position: 'bottom',
  },
];
