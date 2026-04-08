import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createHmac } from 'crypto';

const MAX_BODY_SIZE = 1_048_576;
const COOKIE_NAME = 'sd_auth';

/**
 * HMAC署名付きセッショントークンを検証する。
 * トークン形式: `{uuid}.{hmac-sha256-hex}`
 */
function verifySessionToken(cookieValue: string): boolean {
  const dotIndex = cookieValue.indexOf('.');
  if (dotIndex === -1) return false;

  const sessionId = cookieValue.slice(0, dotIndex);
  const sig = cookieValue.slice(dotIndex + 1);
  if (!sessionId || !sig) return false;

  const hmacSecret = process.env.SITE_PASSWORD ?? 'fallback-secret';
  const expected = createHmac('sha256', hmacSecret).update(sessionId).digest('hex');

  // 長さが異なる場合は即座にfalse（定数時間比較は同じ長さのバッファが必要）
  if (sig.length !== expected.length) return false;

  // 簡易的な定数時間比較（Edge Runtimeではcrypto.timingSafeEqualが使えない場合がある）
  let result = 0;
  for (let i = 0; i < sig.length; i++) {
    result |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

// 認証不要なパス
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/health', '/api/tldv/webhook'];

export function middleware(request: NextRequest) {
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
    if (!auth || !verifySessionToken(auth.value)) {
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
