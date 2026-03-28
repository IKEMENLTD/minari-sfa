import { API_TIMEOUT_MS } from '@/lib/constants';
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
  // Base64エンコード版を優先（Renderで"を含むJSONが設定できないため）
  const base64 = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;
  const json = base64
    ? Buffer.from(base64, 'base64').toString('utf-8')
    : process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) {
    throw new Error('環境変数 GOOGLE_SERVICE_ACCOUNT_BASE64 または GOOGLE_SERVICE_ACCOUNT_JSON が設定されていません');
  }
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string' || typeof parsed.token_uri !== 'string') {
      throw new Error('サービスアカウントJSONに必須フィールド(client_email, private_key, token_uri)が不足しています');
    }
    return parsed as unknown as ServiceAccountCredentials;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error('サービスアカウントJSONが有効なJSONではありません');
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
// Public API
// ---------------------------------------------------------------------------

/**
 * PROUD Note ファイル一覧を取得する
 */
export async function fetchProudNoteFiles(): Promise<ProudNoteFile[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const token = await getAccessToken(controller.signal);

    const proudFolderId = process.env.GOOGLE_DRIVE_PROUD_FOLDER_ID;
    const folderFilter = proudFolderId
      ? `'${proudFolderId}' in parents and `
      : '';
    const response = await fetch(
      `${GOOGLE_DRIVE_API}?q=${encodeURIComponent(`${folderFilter}mimeType='application/vnd.google-apps.document'`)}&orderBy=modifiedTime desc`,
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
