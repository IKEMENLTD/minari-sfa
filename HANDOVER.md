# 内藤さんシステム 本番デプロイ引き継ぎ書

最終更新: 2026-05-12 / コミット `d7696a4` まで

このドキュメントは本番デプロイ前に必ず読む手順書です。**順番通りに実行してください**。

---

## 0. 全体像

- **構成**: Next.js 16 + Supabase + Netlify + Claude API + TLDV
- **認証**: ユーザー選択 + 共有パスワード(`SITE_PASSWORD`) + HMAC署名 cookie
- **本番URL**: Netlify サイト URL (`process.env.URL` で取得される)

デプロイは以下の3工程:
1. **Supabase** に migration を順番に適用
2. **Netlify** に環境変数を設定
3. **コードをデプロイ** (GitHub `IKEMENLTD/minari-sfa` の main ブランチを Netlify が auto-deploy)

---

## 1. Supabase migration 適用 (順番厳守)

Supabase Studio の **SQL Editor** で 以下のファイルを **001 → 006 の順に** 全文コピペ実行。

```
supabase/migrations/
├─ 001_schema.sql                          ← テーブル全部作成
├─ 002_add_missing_rls.sql                 ← RLS(後で 005 で置換される)
├─ 003_settings.sql                        ← app_settings/job_logs
├─ 004_meeting_title_thumbnail.sql         ← meetings に title/thumbnail
├─ 005_seed_users_and_rls_hardening.sql    ← ⚠️ Phase 1 重要: users seed + DENY-ALL RLS
└─ 006_suggested_deal_title.sql            ← Phase A: AI案件名カラム
```

### 1-1. 既に DB を作ってある場合
- 001-004 は適用済みのはず → スキップ
- **005 と 006 だけ実行** すれば良い

### 1-2. seed されたユーザーを実値に更新 (必須)

005 で `内藤健司 (naito@example.com)` 等のダミーが入る。**本番運用前に必ず置換**:

```sql
-- 実メール/氏名へ更新(冪等)
UPDATE users SET email='naito@実ドメイン.co.jp', name='内藤健司' WHERE email='naito@example.com';
UPDATE users SET email='メンバーA@実ドメイン.co.jp', name='実名A' WHERE email='member_a@example.com';
UPDATE users SET email='メンバーB@実ドメイン.co.jp', name='実名B' WHERE email='member_b@example.com';

-- 確認(0件であること)
SELECT COUNT(*) FROM users WHERE email LIKE '%@example.com';
```

### 1-3. ロールバック(緊急時のみ)
各 migration ファイル末尾コメントの「ロールバック手順」を参照。005 は内部に詳細記載。

---

## 2. Netlify 環境変数

Site settings → **Environment variables** で以下を設定:

| 変数名 | 用途 | 生成例 / 値 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Supabase Studio → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (機密) | 同上(隠蔽必須) |
| `SITE_PASSWORD` | 共有ログインパスワード | `openssl rand -base64 24` または `node -e "console.log(require('crypto').randomBytes(24).toString('base64'))"` |
| `AUTH_HMAC_SECRET` | (推奨) HMAC署名鍵を分離 | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CLAUDE_API_KEY` | Anthropic API key | `sk-ant-...` |
| `TLDV_API_KEY` | TLDV API key | TLDVダッシュボード |
| `TLDV_WEBHOOK_SECRET` | TLDV Webhook 署名検証用 | TLDVと同値を設定 |
| `BACKGROUND_FUNCTION_SECRET` | Background Function 認証 | 32バイト ランダム16進 |
| `NODE_ENV` | 環境 | `production` |

### 重要: `AUTH_HMAC_SECRET` 分離の意義
- 未設定なら `SITE_PASSWORD` が fallback として使われる(後方互換)
- 設定すると **パスワード変更時に全員ログアウトの DoS を回避** できる
- 推奨: 別変数で管理し、ローテーションは別タイミングで実施

### TLDV Webhook 設定
TLDV ダッシュボードで以下を設定:
- URL: `https://<Netlifyドメイン>/api/tldv/webhook`
- イベント: `TranscriptReady`
- 署名検証: HMAC-SHA256 (シークレットを `TLDV_WEBHOOK_SECRET` と一致させる)
- **timestamp フィールドを含むこと** (Phase 2 で必須化、欠落で403)

---

## 3. デプロイ手順

### 3-1. Netlify 連携 (初回のみ)
- GitHub `IKEMENLTD/minari-sfa` の main ブランチを連携
- Build command: `npm run build`
- Publish directory: `.next`
- `@netlify/plugin-nextjs` が `netlify.toml` で有効化済

### 3-2. デプロイ後 動作確認チェックリスト

```
[ ] /login にアクセス → ユーザー選択dropdown が3名表示される
[ ] 内藤さんでログイン → / にリダイレクトされる
[ ] /meetings で「tldvから同期」ボタン押下 → 会議リストが取得される
[ ] 未紐付け会議を開く → 「コンタクト候補」カード表示 → 1クリック紐付け成功
[ ] AI要約「生成」ボタン押下 → 3分以内に要約が表示される(Background Function 動作確認)
[ ] AI要約欄の「この会議から案件を作成」ボタン → モーダル → AI提案案件名 → 作成 → /deals/{id} 遷移
[ ] /import で 数行のCSVをアップロード → 重複は409 で skip カウント表示
[ ] CSP ヘッダ確認: ブラウザDevTools Network → response headers に Content-Security-Policy
[ ] HTTPS強制: HTTPアクセスで400(本番環境のみ)
[ ] Settings API: claude_api_key を POST → 400 で拒否されること
```

---

## 4. 運用注意

### 4-1. ロール変更後のキャッシュ無効化
- `users.role` を変更したら **5分以内に反映されない** ことがある (auth.ts の roleCache)
- 即時反映したい場合:
  - 該当ユーザーが logout → re-login (ローカル roleCache + クライアント cookie が両方クリア)
  - または admin が `POST /api/auth/refresh-role` `{"user_id": "..."}` を呼ぶ

### 4-2. SITE_PASSWORD 変更時
- 既存ログイン中ユーザーは **強制ログアウト** される
- ただし `AUTH_HMAC_SECRET` を別途設定している場合、HMAC は無効化されないので継続できる
- **共有パスワード漏洩時**: SITE_PASSWORD と AUTH_HMAC_SECRET の **両方** を変更する

### 4-3. TLDV 同期の skip 理由
`/meetings` の「tldvから同期」を押すと、自動紐付けで以下の理由が出ることがある:
| 理由 | 対応 |
|---|---|
| `no_name_match` | コンタクト未登録 → 新規作成 |
| `ambiguous_no_company` | 同名複数あり → 手動選択 |
| `company_mismatch` | 同名あるが会社違い → 会社名追加 |
これらは sync 結果メッセージに表示される + 「→未紐付け一覧」ボタンで遷移可能。

### 4-4. CSV インポート上限
- **最大1000行/回**
- **最大5MB/リクエスト** (middleware で制限)
- **1分あたり3回まで** (rate limit)
- 重複(同名+会社名 / email)は自動skip

---

## 5. 監視・ログ

- **エラーログ**: `console.error` および `src/lib/logger.ts` → Netlify Functions の log
- **Background Function**: `job_logs` テーブルに started/completed/error が記録される
- **未導入**: Sentry/Datadog 等の外部監視通知 → `src/lib/logger.ts` 内 TODO[ops] で導入ポイント明示済

---

## 6. 既知制限・残課題

本番投入時点で **既知の制限事項**。運用への影響度別に列挙:

### 6-1. 機能的制限(運用で回避可能)
- **CSV インポート上限**: 1000行/回、5MB/req、3req/分。1万件移行時は10回に分割。
- **TLDV ページ巡回上限**: 2000件(maxPages=20 × pageSize=100)。それ以上は `fetchAllMeetings` の maxPages 引数を増やす。
- **contact プルダウン**: meetings/[id] の deal/contact 選択肢は500件まで(検索化未実装)。500人超は手動入力前提。

### 6-2. 運用上の遅延
- **roleCache 5分 TTL**: role 変更後の即時反映が必要なら `POST /api/auth/refresh-role` を叩く(管理者のみ)。
- **AI要約のpolling**: meeting詳細で生成は最大3分待ち。タイムアウト時はリロードで再確認。

### 6-3. 未導入機能
- **Sentry等の監視通知**: `console.error` のみ。外部通知はPhase6で導入。
- **テストカバレッジ**: participant-parser/auto-link-contactsのpure logicのみ。webhook/login route 等の統合テスト未実装。
- **distributed rate limit**: in-memory(関数インスタンス単位)。Netlify 単一function化で実害低、将来Supabase rate_limits テーブル化検討。

### 6-4. 既知のセキュリティ前提
- **パスワード共有認証**: 全ユーザー同じ `SITE_PASSWORD`。退職者発生時は SITE_PASSWORD を rotate、全員に新パスワードを再共有。
  - `AUTH_HMAC_SECRET` を別途設定していれば、SITE_PASSWORD だけ変えても既存セッションは生きる(便利だが退職者対策では両方変える)。
- **service_role**: API は全て service_role で DB アクセス(RLS bypass)。API側 validateAuth + requireRole に依存。

---

## 7. トラブルシューティング

| 症状 | 原因候補 | 対応 |
|---|---|---|
| ログインで「認証失敗」連発 | パスワード違い / IPまたはuser_idの rate limit(5回/分) | 1分待つ、SITE_PASSWORD env確認 |
| `/api/auth/users` が 500 | `users` テーブル未作成 / DB接続不可 | migration 001 適用確認、SUPABASE_SERVICE_ROLE_KEY 確認 |
| 「セッショントークンが無効」で何度もログイン要求 | SITE_PASSWORD or AUTH_HMAC_SECRET が変更された | 想定動作。再ログイン |
| TLDV同期で「同期エラー」 | TLDV_API_KEY未設定 / TLDV側のrate limit | env確認、リトライ済(3回指数back-off)で本当に失敗していれば外部要因 |
| AI要約が10分超 | Claude API遅延 / Background Function timeout(10分) | job_logs テーブル確認、再生成 |
| Webhook が「リプレイ判定で拒否」 | TLDV側 webhook ペイロードに `timestamp` 欠落 | TLDVダッシュボードで設定確認 |
| CSV import で「重複スキップ」が大量 | 既存contact と (full_name, company_name) 重複 | 想定動作。サーバ側エラーレスポンスで件数確認 |
| /api/import が 429 | rate limit (3回/分/userId) | 1分待つ |
| 案件作成モーダルで「作成中...」が止まらない | ネットワーク中断 / DB エラー | DevTools Network 確認、リロード(submitting state でボタン無効化される設計) |
| /login で全員admin扱いされる(古い token) | Phase1前にログインしたcookie | cookie 削除して再ログイン(token形式変更により) |

---

## 8. 緊急時連絡先 & 監視体制

> ⚠️ **本番デプロイ前に必ず埋めること**。空欄のまま本番投入禁止。

### 8-1. 連絡先
- 開発者: ___
- Supabase プロジェクト owner: ___
- Netlify オーナー: ___
- TLDV 契約者: 内藤健司
- インシデント対応SLA: ___ (例: 営業時間内30分以内、夜間翌営業日)

### 8-2. デプロイ直後 1-2週間の監視強化
Sentry 等の外部監視を Phase 4 で導入するまでの間は、**人手で目視監視を厚めに**:

| 監視対象 | 頻度 | 確認方法 |
|---|---|---|
| Netlify Functions ログ | 1日2回(朝/夕) | Netlify dashboard → Functions → logs |
| `job_logs` テーブル `status='error'` 件数 | 1日1回 | Supabase Studio → SQL Editor で `SELECT * FROM job_logs WHERE status='error' AND created_at > now() - interval '1 day'` |
| `/api/health` 応答 | 5分間隔 | UptimeRobot 等で監視設定 |
| ユーザーからのエラー報告 | 都度 | Chatwork/Slack で報告窓口を明示 |

### 8-3. ROADMAP(付録B)所有権
- Phase 4 監視導入: 担当 ___ / 期限 ___
- Phase 5 テスト拡充: 担当 ___ / 期限 ___
- Phase 6 スケーリング: トリガー条件「contact 1000件 or ユーザー10人」発生時に着手
- Phase 7 機能拡張: プロダクトオーナー判断

---

## 付録 A: コミット履歴

| Commit | 内容 | レビュー |
|---|---|---|
| `d5e4e60` | Phase 1: Auth/RLS/Claude key 等 Critical 5件 | 平均 97.8 |
| `d8c0f3e` | Phase 2: Auth残穴+TLDV信頼性+業務UX | 平均 97.2 |
| `d7696a4` | Phase 3-A: Import+Dashboard+運用+案件名生成 | 平均 97.4 |

リポジトリ: `https://github.com/IKEMENLTD/minari-sfa`

---

## 付録 B: Post-Deploy ROADMAP

本番投入後の Phase。`§6-3 未導入機能` の解消順:

### Phase 4: 監視基盤 (推奨: 投入後1-2週)
- **Sentry**: `@sentry/nextjs` 追加。`src/lib/logger.ts` 末尾のコメント実装(beforeSend スクラビング)を有効化
- **uptime 監視**: Better Uptime / UptimeRobot で `/api/health` を1分間隔ping
- **アラート**: Critical エラーは Chatwork/Slack へ自動通知

### Phase 5: テスト拡充 (推奨: 投入後2-4週)
- 既存: 43 unit tests (participant-parser/auto-link-contacts/secrets/auth)
- 追加目標:
  - API integration: `/api/auth/login`, `/api/tldv/webhook`, `/api/import` (MSW)
  - E2E: Playwright で「ログイン→TLDV同期→紐付け→案件作成」
- coverage threshold 70% を CI gate に追加

### Phase 6: スケーリング (推奨: contact 1000件超え時)
- rate limit を Supabase `rate_limits` テーブルに分散化
- contact プルダウンを Combobox + サーバ側 ilike検索化 (500件超え対応)
- CSV streaming(ndjson)で大量データ incremental 処理

### Phase 7: 機能拡張 (要件§7 "Could" スコープ)
- 録音ファイル→文字起こし、Tier3-4 自動メール、Outlook連携、Eight連携
