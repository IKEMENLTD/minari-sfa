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
  return JSON.parse(json) as ServiceAccountCredentials;
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

/**
 * Google ドキュメントにテキストを追記する
 */
export async function appendToDocument(
  docId: string,
  content: string
): Promise<void> {
  if (isMockMode()) {
    console.log(`[モック] Google Docs 追記: docId=${docId}, 内容=${content.slice(0, 50)}...`);
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
  if (isMockMode()) {
    const mockId = generateId();
    console.log(`[モック] Google Docs 作成: 企業=${companyName}, フォルダ=${folderId}`);
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
