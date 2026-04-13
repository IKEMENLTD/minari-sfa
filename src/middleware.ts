import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const MAX_BODY_SIZE = 1_048_576;
const COOKIE_NAME = 'sd_auth';

/**
 * hex文字列をUint8Arrayに変換
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Uint8Arrayをhex文字列に変換
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * HMAC署名付きセッショントークンを検証する（Web Crypto API使用）。
 * トークン形式: `{uuid}.{hmac-sha256-hex}`
 */
async function verifySessionToken(cookieValue: string): Promise<boolean> {
  const dotIndex = cookieValue.indexOf('.');
  if (dotIndex === -1) return false;

  const sessionId = cookieValue.slice(0, dotIndex);
  const sig = cookieValue.slice(dotIndex + 1);
  if (!sessionId || !sig) return false;

  const hmacSecret = process.env.SITE_PASSWORD;
  if (!hmacSecret) {
    console.error('SITE_PASSWORD 環境変数が設定されていません');
    return false;
  }
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(hmacSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(sessionId))
  );
  const expected = bytesToHex(signatureBytes);

  // 長さが異なる場合は即座にfalse
  if (sig.length !== expected.length) return false;

  // 定数時間比較
  let result = 0;
  for (let i = 0; i < sig.length; i++) {
    result |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

// 認証不要なパス
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/health', '/api/tldv/webhook', '/.netlify/functions/'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // パストラバーサル防止
  const decodedPath = decodeURIComponent(pathname);
  if (decodedPath.includes('..') || decodedPath.includes('\0')) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  // API ルートへの Content-Length チェック
  if (pathname.startsWith('/api/')) {
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return NextResponse.json(
        { data: null, error: 'リクエストボディが大きすぎます（上限: 1MB）' },
        { status: 413 }
      );
    }
  }

  // 認証チェック（公開パスはスキップ）
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (!isPublic) {
    const auth = request.cookies.get(COOKIE_NAME);
    if (!auth || !(await verifySessionToken(auth.value))) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // 静的ファイルと _next を除外
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
