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

## 16. 残課題

| 項目 | 状態 | 詳細 |
|------|------|------|
| Jamroll APIキー | 未取得 | 本物のAPIキーが必要 |
| USE_MOCK=false | 未移行 | Supabase Auth導入時に切り替え |
| RLS有効化 | 未実行 | 002_enable_rls.sql をSupabaseで実行 |
| Google Driveフォルダ復旧 | 要対応 | 処理完了フォルダの再作成 |
| GOOGLE_DRIVE_SHARE_EMAIL | 未設定 | Renderに追加 |
| SITE_PASSWORDクォート除去 | 要対応 | Render環境変数 |
| モックデータDB削除 | 要実行 | Supabase SQL Editor |
