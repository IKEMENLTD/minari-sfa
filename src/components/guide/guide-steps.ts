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
  // ── ダッシュボード ──
  {
    id: 'dashboard-intro',
    page: '/',
    targetSelector: 'h1',
    title: 'SALES DECK へようこそ',
    description:
      'ここはダッシュボードです。営業活動の全体像をひと目で把握できるホーム画面です。承認待ちの議事録・進行中の案件・今週の商談件数など、重要な数字がリアルタイムで表示されます。',
    position: 'bottom',
  },
  {
    id: 'summary-cards',
    page: '/',
    targetSelector: '[data-guide="summary-cards"]',
    title: 'サマリーカード',
    description:
      '4つのカードで主要指標を確認できます。「承認待ち」は取り込み後まだ確認されていない議事録の数、「進行中の案件」は現在アクティブな商談数、「今週の商談」は直近7日間の商談数、「直近更新」は最近更新された案件数を表します。',
    position: 'bottom',
  },
  {
    id: 'pending-section',
    page: '/',
    targetSelector: '[data-guide="pending-section"]',
    title: '承認待ち商談',
    description:
      '未承認の議事録が最大5件表示されます。日付をクリックすると詳細ページで議事録の全文やAI要約を確認できます。右上の「○件を承認する」ボタンから取り込み・承認ページに直接ジャンプすることもできます。',
    position: 'bottom',
  },
  {
    id: 'sidebar-nav',
    page: '/',
    targetSelector: 'aside nav',
    mobileTargetSelector: '[data-guide="mobile-menu"]',
    title: 'ナビゲーション',
    description:
      'サイドバーから4つのページに移動できます。「ホーム」はこのダッシュボード、「商談記録」は全議事録の検索・閲覧、「取り込み・承認」は新しい議事録の取り込みと承認処理、「案件ボード」は案件の進捗管理です。スマートフォンでは左上のメニューボタンから開けます。',
    position: 'right',
    mobilePosition: 'bottom',
  },
  {
    id: 'notebooklm-link',
    page: '/',
    targetSelector: '[data-guide="notebooklm-link"]',
    mobileTargetSelector: '[data-guide="mobile-menu"]',
    title: 'NotebookLM連携',
    description:
      'サイドバー下部の「NotebookLM」リンクから、Googleの AI分析ツール NotebookLM をワンクリックで開けます。SALES DECKがGoogle Docsに書き出した分析レポートをNotebookLMに投入すると、AIがスライド生成や深掘り分析を行ってくれます。スマートフォンではアプリが自動で起動します。商談詳細ページでDocs書き出し後にも「NotebookLMで分析する」ボタンが表示されます。',
    position: 'right',
    mobilePosition: 'bottom',
  },
  {
    id: 'header-logout',
    page: '/',
    targetSelector: '[data-guide="logout-button"]',
    title: 'ログアウト',
    description:
      '右上のアイコンからログアウトできます。セッションが終了し、ログイン画面に戻ります。',
    position: 'bottom',
  },

  // ── 商談記録 ──
  {
    id: 'meetings-intro',
    page: '/meetings',
    targetSelector: 'h1',
    title: '商談記録ページ',
    description:
      '取り込んだ全ての議事録を一覧で確認できるページです。各行をクリックすると、議事録の原文・AI要約・推定企業名・参加者・商談日などの詳細を閲覧できます。承認ステータスに応じて色分けされたバッジが表示されます。',
    position: 'bottom',
  },
  {
    id: 'meetings-filter',
    page: '/meetings',
    targetSelector: '[data-guide="filter-select"]',
    title: 'ステータスフィルタ',
    description:
      'ドロップダウンで議事録をステータスごとに絞り込めます。「全て」で全件表示、「承認待ち」で未処理の議事録、「承認済み」で確認済みの議事録、「却下」で除外された議事録を表示します。案件ボードから企業名でフィルタした場合は、上部に「企業でフィルタ中」と表示されます。',
    position: 'bottom',
  },

  // ── 取り込み・承認 ──
  {
    id: 'approval-intro',
    page: '/approval',
    targetSelector: 'h1',
    title: '取り込み・承認ページ',
    description:
      'SALES DECKの中核となるページです。PLOUDNOTEやJamrollに録音された商談議事録を取り込み、AIが企業名を推定します。内容を確認して「承認」すると商談記録と案件ボードに反映され、Google Docsへの分析レポート書き出しも自動で行われます。なお、サーバーが15分ごとにGoogle Driveの新着を自動チェックし、新しい議事録があればAI要約まで自動で処理して承認待ちに追加します。',
    position: 'bottom',
  },
  {
    id: 'approval-fetch',
    page: '/approval',
    targetSelector: '[data-guide="fetch-button"]',
    title: '新しい議事録を取り込む',
    description:
      'このボタンで今すぐ手動取り込みを実行できます。PLOUDNOTEから1件ずつ最大30件まで連続で取り込み、取り込み中は進捗が表示されます。隣の「過去の議事録を取り込む」では日付範囲を指定して過去分を一括取得できます。通常は15分ごとの自動取り込みで十分ですが、すぐに確認したいときに手動ボタンをお使いください。ツアー終了後にお試しください。',
    position: 'bottom',
  },
  {
    id: 'approval-cards-area',
    page: '/approval',
    targetSelector: '[data-guide="approval-area"]',
    title: '承認カードの操作方法',
    description:
      '取り込まれた議事録がカード形式で表示されます。各カードにはAIが推定した企業名・ソース元（PLOUD等）・商談日・参加者が表示されます。「はい」で承認、「いいえ」で企業名の修正画面に切り替わります。修正時は既存企業から選択するか、新規企業名を入力できます。類似企業がある場合は統合の確認が表示されます。「却下」で議事録を除外できます。',
    position: 'top',
  },

  // ── 案件ボード ──
  {
    id: 'deals-intro',
    page: '/deals',
    targetSelector: 'h1',
    title: '案件ボード',
    description:
      '承認された商談から自動作成された案件を管理するページです。企業ごとにカードが作成され、営業フェーズ・進捗率・ネクストアクション・ステータス要約・最終商談日が一覧表示されます。「関連議事録を見る」リンクからその企業の全商談記録にジャンプすることもできます。',
    position: 'bottom',
  },
  {
    id: 'deals-search',
    page: '/deals',
    targetSelector: '[data-guide="deals-search"]',
    title: '企業名検索',
    description:
      'テキスト入力で企業名を検索し、表示する案件を絞り込めます。案件数が増えてきたときに、特定の企業をすばやく見つけるのに便利です。',
    position: 'bottom',
  },
  {
    id: 'deals-sync',
    page: '/deals',
    targetSelector: '[data-guide="sync-button"]',
    title: 'スプレッドシート同期',
    description:
      '全ての案件データと企業マスタをGoogleスプレッドシート「全顧客管理マスタ」に同期します。企業情報・フェーズ・経過日数・SALES DECK DocのURL・PLOUD原本URLなどが自動で書き込まれます。共有メンバーとデータを共有したいときや、NotebookLMで分析したいときにご活用ください。ツアー終了後にお試しください。',
    position: 'bottom',
  },
  {
    id: 'help-button-intro',
    page: '/deals',
    targetSelector: '[data-guide="help-fab"]',
    title: 'ヘルプボタン',
    description:
      'このガイドツアーはいつでも再開できます。画面右下の「?」ボタンをクリックすると、最初からツアーを開始します。操作に迷ったらいつでもお試しください。お疲れ様でした！',
    position: 'top',
  },
];
