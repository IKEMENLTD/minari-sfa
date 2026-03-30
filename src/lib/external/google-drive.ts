import { createSign } from 'crypto';
import { API_TIMEOUT_MS } from '@/lib/constants';
import type { ProudNoteFile } from '@/types';

// ---------------------------------------------------------------------------
// Google Drive / Docs API 連携
// ---------------------------------------------------------------------------

const GOOGLE_DOCS_API = 'https://docs.googleapis.com/v1/documents';
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/spreadsheets';

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  token_uri: string;
}

/**
 * Google サービスアカウント認証情報を取得する
 */
function getCredentials(): ServiceAccountCredentials {
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
 * Base64url エンコード（JWT用）
 */
function base64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// トークンキャッシュ（有効期限50分）
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * サービスアカウントのJWTを生成し、OAuthトークンを取得する（キャッシュ付き）
 */
export async function getAccessToken(signal: AbortSignal): Promise<string> {
  // キャッシュが有効ならそのまま返す
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const creds = getCredentials();
  const now = Math.floor(Date.now() / 1000);

  // JWT Header
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));

  // JWT Claim Set
  const claimSet = base64url(JSON.stringify({
    iss: creds.client_email,
    scope: SCOPES,
    aud: creds.token_uri,
    iat: now,
    exp: now + 3600,
  }));

  // JWT Signature
  const signInput = `${header}.${claimSet}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signInput);
  const signature = sign.sign(creds.private_key, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${signInput}.${signature}`;

  const response = await fetch(creds.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Google OAuth エラー詳細:', errorBody);
    throw new Error(`Google OAuth エラー (${response.status})`);
  }

  const data = (await response.json()) as { access_token: string };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + 50 * 60 * 1000 };
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
      `${GOOGLE_DRIVE_API}?q=${encodeURIComponent(`${folderFilter}mimeType='application/vnd.google-apps.document'`)}&orderBy=modifiedTime desc&fields=${encodeURIComponent('files(id,name,modifiedTime)')}`,
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
        const docData = (await docResponse.json()) as {
          body?: { content?: Array<{ paragraph?: { elements?: Array<{ textRun?: { content?: string } }> } }> }
        };
        const content = (docData.body?.content ?? [])
          .map((block) =>
            (block.paragraph?.elements ?? [])
              .map((el) => el.textRun?.content ?? '')
              .join('')
          )
          .join('');

        files.push({
          id: file.id,
          title: file.name,
          date: file.modifiedTime?.split('T')[0] ?? new Date().toISOString().split('T')[0],
          content: content || `(ドキュメント「${file.name}」の内容を取得できませんでした)`,
        });
      } else {
        console.error(`Google Docs ${file.id} の取得失敗: ${docResponse.status}`);
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
 * 企業名に一致するサブフォルダを検索する
 */
export async function findCompanyFolder(
  companyName: string,
  parentFolderId: string,
): Promise<{ folderId: string; folderName: string } | null> {
  if (!DOC_ID_PATTERN.test(parentFolderId)) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const token = await getAccessToken(controller.signal);
    // 企業名を含むフォルダを検索（完全一致 or 部分一致）
    const q = encodeURIComponent(
      `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    );
    const res = await fetch(
      `${GOOGLE_DRIVE_API}?q=${q}&fields=files(id,name)&pageSize=100`,
      { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as { files?: Array<{ id: string; name: string }> };
    if (!data.files?.length) return null;

    // 完全一致 → 部分一致（企業名がフォルダ名に含まれる or フォルダ名が企業名に含まれる）
    const exact = data.files.find((f) => f.name === companyName);
    if (exact) return { folderId: exact.id, folderName: exact.name };

    const partial = data.files.find(
      (f) => companyName.includes(f.name) || f.name.includes(companyName)
    );
    if (partial) return { folderId: partial.id, folderName: partial.name };

    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * サブフォルダを新規作成する
 */
export async function createFolder(
  folderName: string,
  parentFolderId: string,
): Promise<string> {
  if (!DOC_ID_PATTERN.test(parentFolderId)) {
    throw new Error('無効な親フォルダ ID です');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const token = await getAccessToken(controller.signal);
    const res = await fetch(GOOGLE_DRIVE_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`フォルダ作成エラー (${res.status})`);
    const data = (await res.json()) as { id: string };
    return data.id;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * フォルダ内でSALES DECK Docを検索する（「企業名 - 商談議事録」命名規則）
 */
export async function findSalesDeckDoc(
  companyName: string,
  folderId: string,
): Promise<{ docId: string; docUrl: string } | null> {
  if (!DOC_ID_PATTERN.test(folderId)) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const token = await getAccessToken(controller.signal);
    const searchName = `${companyName} - 商談議事録`;
    const q = encodeURIComponent(
      `'${folderId}' in parents and name='${searchName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.document' and trashed=false`
    );
    const res = await fetch(
      `${GOOGLE_DRIVE_API}?q=${q}&fields=files(id,webViewLink)&pageSize=1`,
      { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as { files?: Array<{ id: string; webViewLink?: string }> };
    const file = data.files?.[0];
    if (!file) return null;

    return {
      docId: file.id,
      docUrl: file.webViewLink ?? `https://docs.google.com/document/d/${file.id}/edit`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * フォルダ内のPLOUDノート原本ドキュメントを検索する（タイムスタンプ付きファイル名）
 */
export async function findProudDocInFolder(
  folderId: string,
): Promise<{ docId: string; docUrl: string; title: string } | null> {
  if (!DOC_ID_PATTERN.test(folderId)) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const token = await getAccessToken(controller.signal);
    const q = encodeURIComponent(
      `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`
    );
    const res = await fetch(
      `${GOOGLE_DRIVE_API}?q=${q}&fields=files(id,name,webViewLink)&orderBy=modifiedTime desc&pageSize=1`,
      { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as { files?: Array<{ id: string; name: string; webViewLink?: string }> };
    const file = data.files?.[0];
    if (!file) return null;

    return {
      docId: file.id,
      docUrl: file.webViewLink ?? `https://docs.google.com/document/d/${file.id}/edit`,
      title: file.name,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// 後方互換: findDocumentInFolder は findSalesDeckDoc + サブフォルダ検索のラッパー
export async function findDocumentInFolder(
  companyName: string,
  parentFolderId: string,
): Promise<{ docId: string; docUrl: string } | null> {
  // まず親フォルダ直下を検索（旧フラット構造）
  const flat = await findSalesDeckDoc(companyName, parentFolderId);
  if (flat) return flat;

  // サブフォルダ内を検索
  const folder = await findCompanyFolder(companyName, parentFolderId);
  if (folder) {
    return findSalesDeckDoc(companyName, folder.folderId);
  }

  return null;
}

/**
 * Google ドキュメントにテキストを追記する
 */
export async function appendToDocument(
  docId: string,
  content: string
): Promise<void> {
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
 * Google ドキュメントの内容を全面置換する（重複追記を防止）
 * 既存の内容を全削除してから新しい内容を挿入する
 */
export async function replaceDocumentContent(
  docId: string,
  content: string
): Promise<void> {
  if (!DOC_ID_PATTERN.test(docId)) {
    throw new Error('無効な Google Doc ID です');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const token = await getAccessToken(controller.signal);

    // 1. ドキュメントの現在の内容長を取得
    const getRes = await fetch(`${GOOGLE_DOCS_API}/${docId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });

    if (!getRes.ok) {
      throw new Error(`Google Docs API 取得エラー (${getRes.status})`);
    }

    const docData = (await getRes.json()) as {
      body?: { content?: Array<{ endIndex?: number }> }
    };
    const bodyContent = docData.body?.content ?? [];
    const lastElement = bodyContent[bodyContent.length - 1];
    const endIndex = lastElement?.endIndex ?? 1;

    // 2. 既存コンテンツを削除（endIndex > 2 なら内容がある）
    const requests: Array<Record<string, unknown>> = [];
    if (endIndex > 2) {
      requests.push({
        deleteContentRange: {
          range: { startIndex: 1, endIndex: endIndex - 1 },
        },
      });
    }

    // 3. 新しいコンテンツを挿入
    requests.push({
      insertText: {
        location: { index: 1 },
        text: content,
      },
    });

    const updateRes = await fetch(
      `${GOOGLE_DOCS_API}/${docId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
        signal: controller.signal,
      }
    );

    if (!updateRes.ok) {
      const errBody = await updateRes.text();
      console.error('Google Docs 置換エラー詳細:', errBody);
      throw new Error(`Google Docs API 置換エラー (${updateRes.status})`);
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

    // フォルダの所有者にドキュメントへのアクセス権を付与
    const shareEmail = process.env.GOOGLE_DRIVE_SHARE_EMAIL;
    if (shareEmail) {
      try {
        await fetch(
          `${GOOGLE_DRIVE_API}/${data.id}/permissions`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              role: 'writer',
              type: 'user',
              emailAddress: shareEmail,
            }),
            signal: controller.signal,
          }
        );
      } catch (permErr) {
        console.error('ドキュメント共有権限の設定に失敗:', permErr instanceof Error ? permErr.message : permErr);
      }
    }

    return {
      docId: data.id,
      docUrl: data.webViewLink || `https://docs.google.com/document/d/${data.id}/edit`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
