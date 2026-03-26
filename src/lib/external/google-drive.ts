import { API_TIMEOUT_MS } from '@/lib/constants';
import { isMockMode, generateId } from '@/lib/utils';
import type { ProudNoteFile } from '@/types';

// ---------------------------------------------------------------------------
// Google Drive / Docs API 連携
// ---------------------------------------------------------------------------

const GOOGLE_DOCS_API = 'https://docs.googleapis.com/v1/documents';
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  token_uri: string;
}

/**
 * Google サービスアカウント認証情報を取得する
 */
function getCredentials(): ServiceAccountCredentials {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) {
    throw new Error('環境変数 GOOGLE_SERVICE_ACCOUNT_JSON が設定されていません');
  }
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string' || typeof parsed.token_uri !== 'string') {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON に必須フィールド(client_email, private_key, token_uri)が不足しています');
    }
    return parsed as unknown as ServiceAccountCredentials;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error('環境変数 GOOGLE_SERVICE_ACCOUNT_JSON が有効なJSONではありません');
    }
    throw err;
  }
}

/**
 * サービスアカウントの OAuth トークンを取得する
 * (本番実装ではJWTを生成してトークンエンドポイントにリクエストする)
 */
async function getAccessToken(signal: AbortSignal): Promise<string> {
  const creds = getCredentials();
  // 簡易的なトークン取得 - 本番ではJWTライブラリを使用
  const response = await fetch(creds.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: 'JWT_TOKEN_PLACEHOLDER', // 本番ではJWTを生成
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Google OAuth エラー (${response.status})`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

// ---------------------------------------------------------------------------
// モック実装
// ---------------------------------------------------------------------------

function getMockProudNoteFiles(): ProudNoteFile[] {
  return [
    {
      id: 'proud-mock-001',
      title: '株式会社DEF様 フォローアップ',
      date: '2026-03-21',
      content: '先日のデモのフィードバックを受けて追加質問に回答。導入時期は4月を目処に検討中とのこと。',
    },
    {
      id: 'proud-mock-002',
      title: '株式会社GHI様 課題ヒアリング',
      date: '2026-03-23',
      content: '新規案件。現在他社ツールを利用中だが乗り換えを検討。コスト面と機能面での比較資料を求められた。',
    },
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * PROUD Note ファイル一覧を取得する
 */
export async function fetchProudNoteFiles(): Promise<ProudNoteFile[]> {
  if (isMockMode()) {
    return getMockProudNoteFiles();
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const token = await getAccessToken(controller.signal);

    const response = await fetch(
      `${GOOGLE_DRIVE_API}?q=mimeType='application/vnd.google-apps.document'&orderBy=modifiedTime desc`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`Google Drive API エラー (${response.status})`);
    }

    const data = (await response.json()) as {
      files: Array<{ id: string; name: string; modifiedTime: string }>;
    };

    // 各ファイルの内容を取得
    const files: ProudNoteFile[] = [];
    for (const file of data.files) {
      // file.id のバリデーション（URLインジェクション防止）
      if (!DOC_ID_PATTERN.test(file.id)) {
        console.warn(`無効な Google Doc ID をスキップ: ${file.id.slice(0, 20)}`);
        continue;
      }
      const docResponse = await fetch(
        `${GOOGLE_DOCS_API}/${file.id}?fields=body`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        }
      );

      if (docResponse.ok) {
        const docData = (await docResponse.json()) as { body: { content: Array<{ paragraph?: { elements: Array<{ textRun?: { content: string } }> } }> } };
        const content = docData.body.content
          .map((block) =>
            block.paragraph?.elements
              .map((el) => el.textRun?.content ?? '')
              .join('') ?? ''
          )
          .join('');

        files.push({
          id: file.id,
          title: file.name,
          date: file.modifiedTime.split('T')[0],
          content,
        });
      }
    }

    return files;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Google Doc ID のバリデーション（英数字, -, _ のみ許可） */
const DOC_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Google ドキュメントにテキストを追記する
 */
export async function appendToDocument(
  docId: string,
  content: string
): Promise<void> {
  // docId のバリデーション（パストラバーサル・URLインジェクション防止）
  if (!DOC_ID_PATTERN.test(docId)) {
    throw new Error('無効な Google Doc ID です');
  }

  if (isMockMode()) {
    console.log('[モック] Google Docs 追記: docId=%s, 内容=%s...', docId.replace(/[\r\n\x1b]/g, ''), content.slice(0, 50).replace(/[\r\n\x1b]/g, ''));
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const token = await getAccessToken(controller.signal);

    const response = await fetch(
      `${GOOGLE_DOCS_API}/${docId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: `\n\n--- ${new Date().toISOString()} ---\n${content}\n`,
              },
            },
          ],
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`Google Docs API 追記エラー (${response.status})`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 企業用の Google ドキュメントを新規作成する
 */
export async function createDocument(
  companyName: string,
  folderId: string
): Promise<{ docId: string; docUrl: string }> {
  // folderId のバリデーション
  if (!DOC_ID_PATTERN.test(folderId)) {
    throw new Error('無効な Google Drive フォルダ ID です');
  }

  if (isMockMode()) {
    const mockId = generateId();
    console.log('[モック] Google Docs 作成: 企業=%s, フォルダ=%s', companyName.replace(/[\r\n\x1b]/g, ''), folderId.replace(/[\r\n\x1b]/g, ''));
    return {
      docId: mockId,
      docUrl: `https://docs.google.com/document/d/${mockId}/edit`,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const token = await getAccessToken(controller.signal);

    const response = await fetch(GOOGLE_DRIVE_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `${companyName} - 商談議事録`,
        mimeType: 'application/vnd.google-apps.document',
        parents: [folderId],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Google Drive API ドキュメント作成エラー (${response.status})`);
    }

    const data = (await response.json()) as { id: string; webViewLink: string };
    return {
      docId: data.id,
      docUrl: data.webViewLink,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
