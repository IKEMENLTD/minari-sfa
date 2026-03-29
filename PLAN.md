# PLAN.md - SALES DECK 技術設計書

> 森井 x 沼倉 業務効率化プロジェクト
> 作成日: 2026-03-26 | 最終更新: 2026-03-29

---

## 1. プロジェクト概要

**アプリケーション名**: SALES DECK
**目的**: SaaS営業向け営業インテリジェンスプラットフォーム
**フェーズ**: PoC → 本番移行準備中
**デプロイ先**: Render (Free Plan)
**リポジトリ**: https://github.com/toshihiro-morii/auto-logger.git

---

## 2. 技術スタック

| カテゴリ | 技術 | バージョン | 用途 |
|---------|------|-----------|------|
| フレームワーク | Next.js (App Router) | ^15.3.3 | SSR/API Routes |
| 言語 | TypeScript | ^6.0.2 | 型安全 |
| UI | React | ^18.3.1 | UIコンポーネント |
| CSS | Tailwind CSS v4 | ^4.2.2 | ユーティリティCSS |
| DB / Auth | Supabase (supabase-js) | ^2.100.0 | PostgreSQL + Auth |
| AI（要約） | Claude Sonnet 4 | claude-sonnet-4-20250514 | 議事録レポート生成（max_tokens: 16384） |
| AI（分類） | Claude Haiku 4.5 | claude-haiku-4-5-20251001 | フェーズ判定（max_tokens: 1024） |
| 外部API | Jamroll API | v1 | 議事録取得 |
| 外部API | Google Drive / Docs API | v3 / v1 | ドキュメント管理 |
| バリデーション | Zod | ^4.3.6 | リクエスト検証 |
| 日付 | date-fns | ^4.1.0 | フォーマット |
| アイコン | lucide-react | ^1.7.0 | SVGアイコン（絵文字禁止） |
| ユーティリティ | clsx | ^2.1.1 | class結合 |

---

## 3. 環境変数

| 変数 | 用途 | 必須 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | ✓ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key | ✓ |
| `CLAUDE_API_KEY` | Anthropic API Key | ✓ |
| `JAMROLL_API_KEY` | Jamroll API Key | △（未取得） |
| `GOOGLE_SERVICE_ACCOUNT_BASE64` | GCPサービスアカウントJSON（Base64） | ✓ |
| `GOOGLE_DRIVE_FOLDER_ID` | 処理完了ドキュメントフォルダ | ✓ |
| `GOOGLE_DRIVE_PROUD_FOLDER_ID` | PLOUDNOTEフォルダ（読み込み元） | ✓ |
| `GOOGLE_DRIVE_JAMROLL_FOLDER_ID` | JAMROLLフォルダ | △ |
| `GOOGLE_DRIVE_SHARE_EMAIL` | Doc作成時の共有先メール | ✓ |
| `SITE_PASSWORD` | ログインパスワード | ✓ |
| `USE_MOCK` | モック認証（PoC: true） | ✓ |
| `NEXT_PUBLIC_BASE_URL` | アプリURL | ✓ |
| `PORT` | ポート（Render: 10000） | ✓ |

---

## 4. DBスキーマ（10テーブル）

| テーブル | 用途 | 主要カラム |
|---------|------|-----------|
| users | ユーザー | name, email, role (admin/manager/member) |
| companies | 企業マスタ | name, tier, expected_revenue, sku_count |
| meetings | 商談メタ | company_id, meeting_date, participants[], source, source_id, approval_status |
| transcripts | 文字起こし全文 | meeting_id, full_text |
| summaries | AI要約 | meeting_id, summary_text, model_used |
| approvals | 承認記録 | meeting_id, is_correct, corrected_company, approved_by |
| google_docs | Google Doc管理 | company_id (UNIQUE), doc_url, doc_id |
| sales_phases | フェーズマスタ（33種） | phase_name, phase_order |
| deal_statuses | 案件進捗 | company_id (UNIQUE), current_phase_id, next_action, status_summary |
| person_company | 人物-企業紐付け | person_name, company_id, confidence |

### UNIQUE制約
- `approvals(meeting_id)` — 1商談1承認
- `meetings(source, source_id)` — 重複取り込み防止
- `deal_statuses(company_id)` — 1企業1案件
- `google_docs(company_id)` — 1企業1Doc

---

## 5. 営業フェーズ定義（33種）

| カテゴリ | フェーズ | order |
|---------|---------|-------|
| リード獲得・初期接触 | リード獲得 → リード精査 → 初回アポ調整 → 初回接触 | 1-4 |
| ヒアリング・課題把握 | ヒアリング実施 → 課題把握 → ニーズ確認 → 決裁者特定 | 5-8 |
| 提案・デモ | 提案準備 → 初回提案 → デモ実施 → トライアル提供 → トライアル評価 | 9-13 |
| 見積・交渉 | 見積作成 → 見積提出 → 価格交渉 → 競合比較 → 社内稟議中 | 14-18 |
| 契約 | 契約条件調整 → 契約書送付 → 契約締結 | 19-21 |
| 導入 | 導入準備 → キックオフ → 初期設定 → トレーニング → 本番稼働 | 22-26 |
| 運用・拡大 | 運用定着 → 定期レビュー → アップセル検討 → 契約更新 | 27-30 |
| 特殊 | 保留 / 失注 / 解約 | 91-93 |

---

## 6. APIエンドポイント一覧

| メソッド | パス | 認証 | ロール | 説明 |
|---------|------|------|-------|------|
| GET | /api/health | ✗ | - | ヘルスチェック |
| POST | /api/auth/login | ✗ | - | ログイン（Cookie設定） |
| POST | /api/auth/logout | ✓ | 全員 | ログアウト（Cookie削除） |
| GET | /api/meetings | ✓ | 全員 | 商談一覧（フィルタ: approval_status, company_id） |
| GET | /api/meetings/[id] | ✓ | 全員 | 商談詳細（?include_transcript=true） |
| POST | /api/approval | ✓ | admin/manager | 承認処理（企業登録・フェーズ判定） |
| POST | /api/process | ✓ | admin/manager | 議事録取り込み（limit, from, to対応） |
| POST | /api/meetings/[id]/resummarize | ✓ | 全員 | 要約再生成 + Google Docs自動書き出し |
| POST | /api/meetings/[id]/export-doc | ✓ | 全員 | Google Docs手動書き出し |
| GET | /api/deals | ✓ | 全員 | 案件一覧 |
| GET | /api/deals/[id] | ✓ | 全員 | 案件詳細 |
| PATCH | /api/deals/[id] | ✓ | admin/manager | 案件ステータス更新 |
| GET | /api/companies | ✓ | 全員 | 企業一覧 |
| GET | /api/phases | ✓ | 全員 | フェーズマスタ |

---

## 7. コアデータフロー

### 7.1 議事録取り込み → 承認 → Google Docs

```
PLOUD Drive            Jamroll API
     │                      │
     ▼                      ▼
POST /api/process (limit=1, 最大30回ループ)
     │
     ├─ Google Drive API: ファイル一覧 + 内容取得
     ├─ 重複チェック（source_id）
     ├─ Claude Sonnet: 詳細議事録レポート生成（500-10000文字）
     ├─ meetings + transcripts + summaries に INSERT
     │
     ▼
承認ページ（ApprovalCard）
     │
     ├─ 企業名検証（類似企業チェック: 法人格・括弧除去で正規化比較）
     ├─ 企業名不明の場合: 修正フォーム自動展開
     │
     ▼
POST /api/approval
     │
     ├─ approvals INSERT
     ├─ companies 検索/作成
     ├─ meetings UPDATE (company_id, approval_status=approved)
     ├─ Claude Haiku: フェーズ判定
     ├─ deal_statuses UPSERT
     │
     ▼
Google Docs書き出し確認UI
     │
     ├─ 新規企業: 「ドキュメントを新規作成しますか？」
     ├─ 既存企業: 「追記しますか？」
     │
     ▼
POST /api/meetings/[id]/export-doc
     │
     ├─ 企業の全承認済み議事録を取得
     ├─ replaceDocumentContent() で全面置換（重複防止）
     ├─ GOOGLE_DRIVE_SHARE_EMAIL にwriter権限付与
     └─ 処理完了フォルダに保存
```

### 7.2 Google Docs構成（企業ごと1つのDoc）

```
アイリスプラザ - 商談議事録
==================================================

────────────────────────────────────────
商談日: 2026-03-27
企業名: アイリスプラザ
参加者: 有村（ラズリ）, 森井（ラズリ）, ...
ソース: proud
────────────────────────────────────────

[詳細な議事録レポート 500-10000文字]

────────────────────────────────────────
商談日: 2026-04-10
...
────────────────────────────────────────

[次回のレポート]
```

---

## 8. ページ構成

| パス | ページ名 | 種別 | 説明 |
|------|---------|------|------|
| / | ホーム | CSR | サマリーカード + 承認待ちCTA + 案件一覧 |
| /login | ログイン | CSR | パスワード認証 |
| /meetings | 商談記録 | CSR | 一覧（フィルタ: ステータス, company_id） |
| /meetings/[id] | 商談詳細 | CSR | メタ情報 + 要約 + 文字起こし + 再生成/書き出しボタン |
| /approval | 取り込み・承認 | CSR | 取り込みボタン + 日付範囲 + ApprovalCard |
| /deals | 案件ボード | CSR | 企業一覧 + フェーズ + 検索 |
| /deals/[id] | 案件詳細 | SSR+CSR | フェーズ編集 + ネクストアクション + 議事録リンク |

---

## 9. 認証方式

### PoC段階（現在）
- Cookie認証: `sd_auth=authenticated`（30日有効）
- `USE_MOCK=true`: API認証スキップ（admin権限でバイパス）
- ログインパスワード: `SITE_PASSWORD`環境変数

### 本番（移行予定）
- Supabase Auth JWT認証
- RLS有効化（002_enable_rls.sql）
- `USE_MOCK=false`

---

## 10. セキュリティ

- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security: max-age=63072000
- Content-Security-Policy: カスタム
- Permissions-Policy: camera=(), microphone=(), geolocation=()
- パストラバーサル防止（middleware.ts）
- Content-Length上限: 1MB
- Zodバリデーション: 全API
- Google Doc IDバリデーション: `[a-zA-Z0-9_-]+`
- レート制限: /api/process 1分3回

---

## 11. 外部サービス

| サービス | 用途 | 認証方式 |
|---------|------|---------|
| Supabase | DB + Auth | Service Role Key |
| Claude API | 要約(Sonnet) + 分類(Haiku) | API Key |
| Jamroll | 議事録取得 | API Key |
| Google Drive API | ファイル一覧・作成 | サービスアカウントJWT（Base64） |
| Google Docs API | コンテンツ読み書き | 同上（トークン50分キャッシュ） |
| Render | ホスティング | GitHub連携 |
| UptimeRobot | 死活監視 | /api/health |

---

## 12. Google Driveフォルダ構成

| フォルダ | 環境変数 | 用途 | 権限 |
|---------|---------|------|------|
| 処理完了ドキュメント | `GOOGLE_DRIVE_FOLDER_ID` | 承認後の企業Doc（出力） | 編集者 |
| PLOUDNOTEフォルダ | `GOOGLE_DRIVE_PROUD_FOLDER_ID` | 議事録ソース（入力） | 閲覧者 |
| JAMROLLフォルダ | `GOOGLE_DRIVE_JAMROLL_FOLDER_ID` | 将来用 | 編集者 |

サービスアカウント: `sales-deck@sales-deck-491516.iam.gserviceaccount.com`

---

## 13. AI要約プロンプト仕様

### summarizeMeeting（Sonnet, 16384トークン）
- NotebookLMスライド生成を前提とした完全な議事録レポート
- 8セクション構成: 概要 / 課題 / 議論詳細 / 温度感 / 金額 / NA / タイムライン / 補足
- 元の30-50%の文字数、最低1000文字
- 重要発言は「」で直接引用
- 数値・固有名詞を一つも漏らさない

### judgeSalesPhase（Haiku, 1024トークン）
- 企業の全承認済み議事録からフェーズを判定
- phaseId + nextAction + statusSummary を返却

---

## 14. 承認時の企業名検証

1. AI推定企業名が空/不明 → 修正フォーム自動展開 + 黄色警告
2. 「はい」クリック → 既存企業と類似チェック（正規化: 法人格・括弧除去・小文字化）
3. 類似検出 → 「既存企業と統合 / 新規作成」選択UI
4. 既存企業から選択 → 類似チェック不要

---

## 15. パフォーマンス

| 処理 | タイムアウト |
|------|------------|
| Claude API / Jamroll API / Google API | 120秒（サーバー） |
| フロントエンドfetch | 30秒（AbortController） |
| ログイン | 15秒 |
| 議事録取り込み | 1件ずつ×最大30回ループ |
| OAuthトークン | 50分キャッシュ |

---

## 16. Renderデプロイ設定

| 項目 | 値 |
|------|-----|
| Build Command | `npm install; npm run build` |
| Start Command | `npm run start` (`next start`) |
| Node.js | >=18.18.0（package.jsonで指定） |
| Auto-Deploy | **OFF**（手動デプロイ推奨） |
| Instance | Free (0.1 CPU / 512MB) |
| Port | 10000 |

**デプロイ手順**: コード変更 → `git push` → Render Dashboard → Manual Deploy → Deploy latest commit

**注意**: pushのたびに再ビルド（2-3分）でサイトがダウンするため、Auto-Deployは必ずOFFにすること。

---

## 17. ファイル構成

```
morii-system/
├── PLAN.md                              # 本設計書
├── package.json / tsconfig.json
├── next.config.ts                       # セキュリティヘッダー設定
├── postcss.config.mjs
├── .env.local / .env.local.example
│
├── supabase/migrations/
│   ├── 001_initial_schema.sql           # 10テーブル定義
│   ├── 002_enable_rls.sql               # RLSポリシー（PoC無効）
│   └── 003_seed_and_constraints.sql     # フェーズシード + UNIQUE制約
│
└── src/
    ├── middleware.ts                     # 認証・セキュリティ
    ├── types/index.ts                   # 全型定義
    │
    ├── lib/
    │   ├── auth.ts                      # 認証ヘルパー（JWT/Mock切替）
    │   ├── constants.ts                 # フェーズ33種 + API_TIMEOUT_MS
    │   ├── utils.ts                     # formatDate, generateId, isMockMode
    │   ├── export-to-doc.ts             # Google Docs書き出し共通関数
    │   ├── supabase/client.ts           # ブラウザ用Supabase
    │   ├── supabase/server.ts           # サーバー用Supabase（service_role）
    │   └── external/
    │       ├── claude.ts                # Claude API（Sonnet要約 + Haiku分類）
    │       ├── jamroll.ts               # Jamroll API
    │       └── google-drive.ts          # Google Drive/Docs API（JWT認証+キャッシュ）
    │
    ├── components/
    │   ├── ui/                          # button, badge, card, input, select,
    │   │                                # table, modal, skeleton（8ファイル）
    │   ├── layout/
    │   │   ├── sidebar.tsx              # ナビ: ホーム/商談記録/取り込み・承認/案件ボード
    │   │   ├── header.tsx               # ユーザー名 + ログアウト
    │   │   └── logo.tsx                 # SALES DECKロゴ
    │   ├── meetings/
    │   │   ├── meeting-list.tsx         # 商談テーブル
    │   │   ├── meeting-detail.tsx       # 詳細表示 + 再生成/書き出しボタン
    │   │   └── approval-card.tsx        # 承認カード（類似企業チェック付き）
    │   └── deals/
    │       ├── deal-list.tsx            # 案件テーブル
    │       ├── deal-card.tsx            # 案件カード（インライン編集）
    │       └── phase-badge.tsx          # フェーズバッジ
    │
    └── app/
        ├── layout.tsx / globals.css
        ├── page.tsx                     # ホーム（ダッシュボード）
        ├── login/page.tsx               # ログイン
        ├── meetings/page.tsx            # 商談記録（Suspense対応）
        ├── meetings/[id]/page.tsx       # 商談詳細（CSR）
        ├── approval/page.tsx            # 取り込み・承認
        ├── deals/page.tsx               # 案件ボード
        ├── deals/[id]/page.tsx          # 案件詳細（SSR+CSR）
        └── api/ (14エンドポイント)
```

---

## 18. UIデザインシステム

### カラートークン（globals.css @theme）

| トークン | 値 | 用途 |
|---------|-----|------|
| `--color-bg` | #fafafa | 背景 |
| `--color-surface` | #ffffff | カード・パネル |
| `--color-border` | #e5e7eb | ボーダー |
| `--color-text` | #111827 | 本文 |
| `--color-text-secondary` | #6b7280 | 副テキスト |
| `--color-accent` | #2563eb | アクション・リンク |
| `--color-accent-hover` | #1d4ed8 | ホバー |
| `--color-muted` | #f3f4f6 | 非活性背景 |

### ボタンバリアント

| バリアント | 用途 | スタイル |
|-----------|------|---------|
| primary | 主要アクション | 青背景 + 白文字 |
| secondary | 副次アクション | ボーダー + 背景なし |
| ghost | 控えめ操作 | 透明 + hover時背景 |
| danger | 破壊的操作 | 赤背景 |

### サイズ

| サイズ | min-height | 用途 |
|-------|-----------|------|
| sm | 36px | テーブル内、補助ボタン |
| md | 44px（WCAG推奨） | 標準 |
| lg | 48px | 大きなCTA |

### サイドバーナビゲーション

| アイコン | ラベル | パス |
|---------|-------|------|
| LayoutDashboard | ホーム | / |
| FileText | 商談記録 | /meetings |
| CheckCircle | 取り込み・承認 | /approval |
| Briefcase | 案件ボード | /deals |

---

## 19. モバイルレスポンシブ仕様

| ブレークポイント | 対応 |
|----------------|------|
| 480px（スマホ） | 1列グリッド、ボタン縦積み、セレクト全幅、テーブル横スクロール |
| 768px（タブレット） | サイドバー非表示→ハンバーガーメニュー、2列グリッド |
| 1024px+（デスクトップ） | サイドバー常時表示、4列グリッド |

### 主な対応

- サイドバー: `hidden md:flex` + ハンバーガーメニュー（スクロールロック付き）
- 承認ページボタン群: `flex-col sm:flex-row`
- 日付フォーム: `grid grid-cols-2 sm:flex`
- 議事録フィルタ: `w-full sm:w-48`
- 案件検索: `w-full sm:w-64`
- 承認カードラジオ: `flex-col sm:flex-row`

---

## 20. processLoop仕様（議事録取り込み）

```
フロントエンド（approval/page.tsx）
  │
  for (i = 0; i < 30; i++) {
  │  表示: 「取り込み中... (N件完了、M回目)」
  │  ↓
  │  POST /api/process { limit: 1, from?, to? }
  │  ├─ 30秒タイムアウト（AbortController）
  │  ├─ Jamroll: プレースホルダーキー検出→即エラー（ハング防止）
  │  ├─ PROUD: Google Drive全ファイル取得→日付フィルタ
  │  ├─ 処理済みチェック（source_id）→スキップ
  │  ├─ Claude Sonnet: 詳細レポート生成（10-15秒/件）
  │  └─ レスポンス: { processedCount, remaining, results, errors }
  │
  │  if (processedCount === 0 && remaining === 0) break;
  │  if (remaining === 0) break;
  }
  │
  表示: 「N件の議事録を取り込みました」+ エラー詳細
```

---

## 21. 再生成時の自動Google Docs書き出し

```
POST /api/meetings/[id]/resummarize
  │
  ├─ transcripts から full_text 取得
  ├─ Claude Sonnet で要約再生成
  ├─ summaries UPDATE（DBは上書き）
  ├─ meetings UPDATE（participants, ai_estimated_company）
  │
  ├─ exportMeetingToDoc(id)  ← 自動実行
  │  ├─ 企業の全承認済み議事録を取得
  │  ├─ replaceDocumentContent() で全面置換
  │  └─ Google Docsは常に最新状態（重複なし）
  │
  └─ レスポンス: { summary_text }
```

---

## 22. GCPサービスアカウント構築手順

1. **@gmail.comアカウント**でGoogle Cloud Consoleにログイン（組織ポリシー回避）
2. プロジェクト作成（組織: なし）
3. APIを有効化: **Google Drive API** + **Google Docs API**
4. IAM → サービスアカウント → 新規作成（名前: sales-deck）
5. 鍵タブ → 新しい鍵 → JSON形式でダウンロード
6. `client_email`を取得（例: `sales-deck@project.iam.gserviceaccount.com`）
7. 3つのDriveフォルダでそのメールを共有（処理完了=編集者、PLOUD=閲覧者、JAMROLL=編集者）
8. JSONをBase64エンコード: `cat key.json | tr -d '\n' | base64 -w 0`
9. Renderに `GOOGLE_SERVICE_ACCOUNT_BASE64` として設定

---

## 23. Supabaseで手動実行が必要なSQL

### フェーズシードデータ（33件）
003_seed_and_constraints.sqlのINSERT文をSQL Editorで実行

### UNIQUE制約
```sql
ALTER TABLE approvals ADD CONSTRAINT uq_approvals_meeting_id UNIQUE (meeting_id);
ALTER TABLE meetings ADD CONSTRAINT uq_meetings_source_source_id UNIQUE (source, source_id);
ALTER TABLE deal_statuses ADD CONSTRAINT uq_deal_statuses_company_id UNIQUE (company_id);
ALTER TABLE google_docs ADD CONSTRAINT uq_google_docs_company_id UNIQUE (company_id);
```

### モックデータ削除
```sql
DELETE FROM meetings WHERE source_id LIKE 'jamroll-mock%' OR source_id LIKE 'proud-mock%';
```

---

## 24. UptimeRobot設定

| 項目 | 値 |
|------|-----|
| Monitor Type | HTTP(s)（Pingではダメ） |
| URL | `https://auto-logger-rhc5.onrender.com/api/health` |
| Interval | 9分（Render無料プランの15分スリープ以内） |
| Alert | メール通知 |

---

## 25. コスト構造

### Claude API

| モデル | 入力 | 出力 | 用途 |
|-------|------|------|------|
| Sonnet 4 | $3/MTok | $15/MTok | 議事録要約（1件あたり約$0.05-0.15） |
| Haiku 4.5 | $0.80/MTok | $4/MTok | フェーズ判定（1件あたり約$0.005） |

### Render無料プラン

| 制限 | 値 |
|------|-----|
| CPU | 0.1 |
| メモリ | 512MB |
| 帯域 | 100GB/月 |
| スリープ | 15分無通信で停止 |
| ビルド | 500分/月 |

---

## 26. Claudeレスポンスのマークダウン除去

Claude APIが ````json ... ```` でJSONを囲んで返すケースがある。`callClaude()`内で自動除去：

```typescript
let text = textContent.text.trim();
if (text.startsWith('```')) {
  text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
}
```

---

## 27. SITE_PASSWORDの注意点

Renderの環境変数でパスワードを設定する際：
- **シングルクォート `'` で囲まない**（Renderが値の一部として扱う）
- **ダブルクォート `"` を値に含めない**（フォームが壊れる）
- 設定例: `EJ$5W%sisjw.sw$EW`（クォートなし、`"`なし）

---

## 28. トラブルシューティング

| 症状 | 原因 | 対策 |
|------|------|------|
| 502/503エラー | Renderスリープ or ビルド中 | UptimeRobot確認。Manual Deploy完了まで待つ |
| 「認証中...」のまま動かない | SITE_PASSWORDにクォート含む、またはサーバー未起動 | 環境変数確認、15秒タイムアウトで自動エラー表示 |
| 承認500エラー | `approved_by`がUUID形式でない | USE_MOCK=trueなら`null`に自動設定済み |
| 文字起こし全文が空 | `?include_transcript=true`未付与 | 修正済み（meetings/[id]/page.tsx） |
| 要約が短い | 旧プロンプトで生成された | 「再生成」ボタンで新プロンプト適用 |
| Google Docs利用規約違反 | `anyone: writer`でフラグされた | `GOOGLE_DRIVE_SHARE_EMAIL`で特定ユーザーに変更済み |
| JSON解析エラー | Claudeが````json```で囲んで返す | callClaude内で自動除去済み |
| 取り込みが永遠に「処理中」 | Jamroll APIが120秒ハング | プレースホルダーキー検出で即エラー + 30秒クライアントタイムアウト |
| useSearchParamsビルドエラー | Suspense未ラップ | meetings/page.tsxでSuspense対応済み |

---

## 29. 残課題

| 項目 | 状態 | 詳細 |
|------|------|------|
| Jamroll APIキー | 未取得 | 本物のAPIキーが必要 |
| USE_MOCK=false | 未移行 | Supabase Auth導入時に切り替え |
| RLS有効化 | 未実行 | 002_enable_rls.sql をSupabaseで実行 |
| Google Driveフォルダ復旧 | 要対応 | 処理完了フォルダの再作成 |
| GOOGLE_DRIVE_SHARE_EMAIL | 未設定 | Renderに追加 |
| SITE_PASSWORDクォート除去 | 要対応 | Render環境変数 |
| モックデータDB削除 | 要実行 | Supabase SQL Editor |
