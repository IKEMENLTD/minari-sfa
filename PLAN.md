# PLAN.md - PoC技術実装計画

> 森井 x 沼倉 業務効率化プロジェクト
> 作成日: 2026-03-26

---

## 1. 技術スタック詳細

| カテゴリ | 技術 | バージョン | 用途 |
|---------|------|-----------|------|
| フレームワーク | Next.js (App Router) | 16.2.1 | SSR/API Routes/サーバーアクション |
| 言語 | TypeScript | 6.0.2 | 型安全 |
| CSS | Tailwind CSS v4 | 4.2.2 | ユーティリティCSS |
| DB | Supabase (supabase-js) | 2.100.0 | PostgreSQL + Auth + Realtime |
| AI | Claude API (Sonnet) | - | 要約/フェーズ判定（モック対応） |
| ホスティング | Render | - | デプロイ先（standalone output） |
| React | React | 19.2.4 | UI |

### 追加インストールが必要なパッケージ

```bash
# Implementer A（バックエンド）が追加
npm install zod               # バリデーション
npm install date-fns           # 日付処理

# Implementer B（フロントエンド）が追加
npm install lucide-react       # アイコン（SVGベース、絵文字不使用）
npm install clsx               # 条件付きclass結合
```

> **注意**: 上記以外のライブラリは追加しない。PoC段階で過剰な依存は禁止。

---

## 2. ファイル構成

```
morii-system/
├── PLAN.md                          # 本ファイル
├── next.config.ts                   # Next.js設定（standalone）
├── package.json
├── tsconfig.json
├── postcss.config.mjs
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql   # [A] 全テーブル定義
│
├── src/
│   ├── app/
│   │   ├── globals.css              # [B] Tailwind + デザイントークン
│   │   ├── layout.tsx               # [B] ルートレイアウト（サイドバー + ヘッダー）
│   │   ├── page.tsx                 # [B] ダッシュボード（/）
│   │   │
│   │   ├── meetings/
│   │   │   ├── page.tsx             # [B] 議事録一覧ページ
│   │   │   └── [id]/
│   │   │       └── page.tsx         # [B] 議事録詳細ページ
│   │   │
│   │   ├── approval/
│   │   │   └── page.tsx             # [B] 承認フローページ
│   │   │
│   │   ├── deals/
│   │   │   ├── page.tsx             # [B] SFA案件一覧ページ
│   │   │   └── [id]/
│   │   │       └── page.tsx         # [B] 案件詳細ページ
│   │   │
│   │   └── api/
│   │       ├── meetings/
│   │       │   ├── route.ts         # [A] GET:一覧 / POST:新規作成
│   │       │   └── [id]/
│   │       │       └── route.ts     # [A] GET:詳細 / PATCH:更新
│   │       │
│   │       ├── approval/
│   │       │   └── route.ts         # [A] POST:承認/却下
│   │       │
│   │       ├── deals/
│   │       │   ├── route.ts         # [A] GET:案件一覧
│   │       │   └── [id]/
│   │       │       └── route.ts     # [A] GET:詳細 / PATCH:ステータス更新
│   │       │
│   │       └── process/
│   │           └── route.ts         # [A] POST:議事録処理トリガー（要約+判定）
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts            # [A] ブラウザ用Supabaseクライアント
│   │   │   └── server.ts            # [A] サーバー用Supabaseクライアント
│   │   │
│   │   ├── external/
│   │   │   ├── claude.ts            # [A] Claude API呼び出し（モック付き）
│   │   │   ├── jamroll.ts           # [A] Jamroll API（モック）
│   │   │   └── google-drive.ts      # [A] Google Drive/Docs API（モック）
│   │   │
│   │   ├── constants.ts             # [A] 営業フェーズ定義（約30種）+ 定数
│   │   └── utils.ts                 # [A] 共通ユーティリティ
│   │
│   ├── components/
│   │   ├── ui/
│   │   │   ├── button.tsx           # [B] ボタン
│   │   │   ├── badge.tsx            # [B] バッジ（ステータス表示）
│   │   │   ├── card.tsx             # [B] カード
│   │   │   ├── input.tsx            # [B] 入力フィールド
│   │   │   ├── select.tsx           # [B] セレクト
│   │   │   ├── table.tsx            # [B] テーブル
│   │   │   ├── modal.tsx            # [B] モーダル
│   │   │   └── skeleton.tsx         # [B] ローディングスケルトン
│   │   │
│   │   ├── layout/
│   │   │   ├── sidebar.tsx          # [B] サイドバーナビゲーション
│   │   │   └── header.tsx           # [B] ヘッダー
│   │   │
│   │   ├── meetings/
│   │   │   ├── meeting-list.tsx     # [B] 議事録一覧コンポーネント
│   │   │   ├── meeting-detail.tsx   # [B] 議事録詳細コンポーネント
│   │   │   └── approval-card.tsx    # [B] 承認カード
│   │   │
│   │   └── deals/
│   │       ├── deal-list.tsx        # [B] 案件一覧コンポーネント
│   │       ├── deal-card.tsx        # [B] 案件カード
│   │       └── phase-badge.tsx      # [B] フェーズバッジ
│   │
│   └── types/
│       └── index.ts                 # [A] 全型定義（DB行型 + API型）
│
└── .env.local.example               # [A] 環境変数テンプレート
```

> **[A]** = Implementer A が担当 / **[B]** = Implementer B が担当

---

## 3. 実装順序

### Step 1: 基盤構築（A と B が並行作業）

| 担当 | 作業内容 | 成果物 |
|------|---------|--------|
| A | 型定義（`types/index.ts`）を最初に作成 | 全テーブルの行型 + API リクエスト/レスポンス型 |
| A | Supabase マイグレーション SQL 作成 | `001_initial_schema.sql`（10テーブル） |
| A | Supabase クライアント設定 | `lib/supabase/client.ts`, `server.ts` |
| A | 環境変数テンプレート | `.env.local.example` |
| B | デザイントークン定義（`globals.css`） | カラー/フォント/スペーシングのCSS変数 |
| B | UIプリミティブ作成 | `components/ui/*`（8ファイル） |
| B | レイアウト作成 | `layout.tsx`, `sidebar.tsx`, `header.tsx` |

> **同期ポイント**: A が `types/index.ts` を完成させたら B に共有。B はこの型を使ってコンポーネントの props を定義する。

### Step 2: 議事録機能（システム1）

| 担当 | 作業内容 | 依存 |
|------|---------|------|
| A | 営業フェーズ定数定義（`constants.ts`） | なし |
| A | 外部APIモック作成（`lib/external/*`） | 型定義 |
| A | 議事録API（`api/meetings/route.ts`） | Supabase + 型定義 |
| A | 議事録処理API（`api/process/route.ts`） | 外部APIモック |
| A | 承認API（`api/approval/route.ts`） | Supabase |
| B | 議事録一覧ページ（`meetings/page.tsx`） | UI部品 + 型定義 |
| B | 議事録詳細ページ（`meetings/[id]/page.tsx`） | UI部品 + 型定義 |
| B | 承認フローページ（`approval/page.tsx`） | UI部品 + 型定義 |

### Step 3: SFA機能（システム2）

| 担当 | 作業内容 | 依存 |
|------|---------|------|
| A | 案件API（`api/deals/route.ts`, `[id]/route.ts`） | Supabase + フェーズ定数 |
| B | 案件一覧ページ（`deals/page.tsx`） | UI部品 + 型定義 |
| B | 案件詳細ページ（`deals/[id]/page.tsx`） | UI部品 + 型定義 |
| B | フェーズバッジ（`phase-badge.tsx`） | フェーズ定数 |

### Step 4: ダッシュボード + 結合

| 担当 | 作業内容 | 依存 |
|------|---------|------|
| B | ダッシュボード（`page.tsx`） | 全API完成後 |
| A+B | API結合テスト | 全ファイル完成後 |

---

## 4. 作業分担

### Implementer A（Backend/Data）

**責任範囲**:
- 全型定義（`src/types/index.ts`）
- DBスキーマ（`supabase/migrations/*`）
- Supabaseクライアント（`src/lib/supabase/*`）
- 外部API連携インターフェース + モック（`src/lib/external/*`）
- 全APIルート（`src/app/api/**/*`）
- 定数・ユーティリティ（`src/lib/constants.ts`, `src/lib/utils.ts`）
- 環境変数テンプレート（`.env.local.example`）

**担当ファイル一覧（15ファイル）**:
```
src/types/index.ts
src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/external/claude.ts
src/lib/external/jamroll.ts
src/lib/external/google-drive.ts
src/lib/constants.ts
src/lib/utils.ts
src/app/api/meetings/route.ts
src/app/api/meetings/[id]/route.ts
src/app/api/approval/route.ts
src/app/api/deals/route.ts
src/app/api/deals/[id]/route.ts
src/app/api/process/route.ts
supabase/migrations/001_initial_schema.sql
.env.local.example
```

### Implementer B（Frontend/UI）

**責任範囲**:
- デザインシステム（CSS変数 + UIコンポーネント）
- 全ページコンポーネント（`src/app/` 配下の `page.tsx`, `layout.tsx`）
- 全表示コンポーネント（`src/components/**/*`）
- レスポンシブ対応

**担当ファイル一覧（21ファイル）**:
```
src/app/globals.css
src/app/layout.tsx
src/app/page.tsx
src/app/meetings/page.tsx
src/app/meetings/[id]/page.tsx
src/app/approval/page.tsx
src/app/deals/page.tsx
src/app/deals/[id]/page.tsx
src/components/ui/button.tsx
src/components/ui/badge.tsx
src/components/ui/card.tsx
src/components/ui/input.tsx
src/components/ui/select.tsx
src/components/ui/table.tsx
src/components/ui/modal.tsx
src/components/ui/skeleton.tsx
src/components/layout/sidebar.tsx
src/components/layout/header.tsx
src/components/meetings/meeting-list.tsx
src/components/meetings/meeting-detail.tsx
src/components/meetings/approval-card.tsx
src/components/deals/deal-list.tsx
src/components/deals/deal-card.tsx
src/components/deals/phase-badge.tsx
```

---

## 5. ファイル境界ルール（衝突回避）

### 絶対に守るルール

1. **A は `src/components/` と ページの `page.tsx` を触らない**
2. **B は `src/app/api/`, `src/lib/`, `src/types/`, `supabase/` を触らない**
3. **唯一の共有インターフェース**: `src/types/index.ts`
   - A が作成・更新する
   - B は読み取り専用で利用する
   - 型の変更が必要な場合、B は A に依頼する

### 共有ファイルの扱い

| ファイル | 初期作成 | 更新権限 |
|---------|---------|---------|
| `src/types/index.ts` | A | A のみ（B は読み取り） |
| `src/lib/constants.ts` | A | A のみ（B はインポートのみ） |
| `src/app/layout.tsx` | B | B のみ |
| `package.json` | - | 各自が必要なパッケージのみ追加 |

### APIコントラクト

A は各APIルートのリクエスト/レスポンス型を `types/index.ts` に定義する。
B はその型に従って fetch を実装する。型が合意されていれば並行作業が可能。

---

## 6. レビュー観点

### Reviewer チェックリスト

**型安全**
- [ ] `any` 型が使われていないこと
- [ ] `types/index.ts` の型がAPI実装・コンポーネントpropsの両方で一貫していること
- [ ] Optional chaining が適切に使用されていること

**API**
- [ ] 全APIルートに try-catch があること
- [ ] バリデーション（zod）が入力値に適用されていること
- [ ] エラーレスポンスが日本語メッセージを含むこと
- [ ] 外部APIモックが差し替え可能な構造であること（環境変数 `USE_MOCK=true` で切替）

**DB**
- [ ] マイグレーションSQLが冪等であること（IF NOT EXISTS）
- [ ] 10テーブルが設計書通りに定義されていること
- [ ] RLS（Row Level Security）ポリシーの有無を確認（PoCでは無効でも可、ただしコメントで明記）

**UI/UX**
- [ ] 絵文字が一切使われていないこと（アイコンはlucide-reactのSVG）
- [ ] レスポンシブ対応（768px / 480px ブレークポイント）
- [ ] ローディング状態（skeleton）が実装されていること
- [ ] 空状態（データ0件時）の表示があること
- [ ] エラー状態の表示があること
- [ ] 日本語UIであること

**デザイン品質**
- [ ] プロフェッショナルSaaS品質（Linear/Notion系の質感）
- [ ] 色使いが統一されていること（デザイントークン参照）
- [ ] フォントサイズ・余白が一貫していること

**セキュリティ**
- [ ] APIキーがフロントエンドに露出していないこと
- [ ] `.env.local` が `.gitignore` に含まれていること

**パフォーマンス**
- [ ] 不要な `'use client'` が最小限であること（Server Components優先）
- [ ] API呼び出しにタイムアウトが設定されていること

---

## 補足: DBスキーマ概要（10テーブル）

Implementer A が `001_initial_schema.sql` で作成するテーブル:

| テーブル名 | 用途 |
|-----------|------|
| `users` | ユーザー管理（森井氏 + 関係者） |
| `companies` | 企業マスタ |
| `meetings` | 議事録メタ情報（日時、参加者、社内MTGフラグ） |
| `transcripts` | 文字起こし全文（meetings と 1:1） |
| `summaries` | AI要約結果（meetings と 1:1） |
| `approvals` | 承認ステータス（meetings と 1:1） |
| `google_docs` | 企業別Googleドキュメント URL 管理 |
| `sales_phases` | 営業フェーズマスタ（約30種） |
| `deal_statuses` | 案件ごとの現在フェーズ + ネクストアクション |
| `person_company` | 人物-企業の紐付け |

---

## 補足: 外部APIモック方針

PoCではAPIキーが未取得のため、以下の方針でモックを構築する:

```typescript
// lib/external/claude.ts の構造例
const USE_MOCK = process.env.USE_MOCK === 'true';

export async function summarizeMeeting(transcript: string): Promise<MeetingSummary> {
  if (USE_MOCK) {
    return mockSummarizeMeeting(transcript);
  }
  // 本番実装（キー取得後に有効化）
  return callClaudeAPI(transcript);
}
```

モック関数は、固定値ではなく入力に応じた「それらしい」値を返す。
承認フローの動作確認に最低限必要なレベルを目指す。

---

## 補足: 営業フェーズ（約30種）

`src/lib/constants.ts` に定義。設計書の定義に従い、Implementer A が実装する。
フェーズの具体的なリストは設計書を参照のこと。
