import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Middleware - 全リクエストに対するセキュリティチェック
 *
 * 1. API ルートへのリクエストボディサイズ制限
 * 2. パストラバーサル防止
 * 3. セキュリティヘッダー追加（CSP）
 */

/** リクエストボディの最大サイズ（1MB） */
const MAX_BODY_SIZE = 1_048_576;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // パストラバーサル防止: デコード後のパスに .. が含まれていたらブロック
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

  // CSP ヘッダーは next.config.ts で一元管理する（重複定義防止）
  return NextResponse.next();
}

export const config = {
  matcher: [
    // 静的ファイルと _next を除外
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
