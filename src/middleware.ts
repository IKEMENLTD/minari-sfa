import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const MAX_BODY_SIZE = 1_048_576;
const COOKIE_NAME = 'sd_auth';

// 認証不要なパス
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/health', '/api/cron/'];

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
    if (!auth || auth.value !== 'authenticated') {
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
