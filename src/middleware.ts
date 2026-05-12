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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_REGEX = /^[0-9a-f]+$/i;

/**
 * 2つの Uint8Array を定数時間で比較する(Edge runtime互換)。
 * Node の `crypto.timingSafeEqual` 同等。長さ違いは事前にfalse返却。
 */
function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * HMAC署名付きセッショントークンを検証する(Web Crypto API使用)。
 * トークン形式: `{userId}.{sessionId}.{hmac-sha256-hex}` (署名対象: userId:sessionId)
 *
 * ---
 * # ⚠️ なぜ src/lib/auth.ts と検証ロジックを共有しないか
 * middleware は **Edge runtime** で実行され Node `crypto` を使えない(Web Crypto API のみ)。
 * lib/auth.ts は **Node runtime** で実行され `timingSafeEqual` 等の同期API が使える。
 * 両者は同じ署名アルゴリズム(HMAC-SHA256, 署名対象 `userId:sessionId`)を実装するが、
 * ランタイム制約により API が異なるため別関数として維持する。
 *
 * **変更時の同期ルール**:
 *   1. トークン形式を変えるときは両ファイルを必ず同時に修正する。
 *   2. 署名対象文字列(現在 `${userId}:${sessionId}`)を変えるときも同様。
 *   3. middleware はDB lookupを行わない(認証のみ)。role検証はAPI側 validateAuth。
 *   4. 共通テスト: トークン作成 → middleware/lib/auth 両方で検証成功すること。
 * ---
 */
async function verifySessionToken(cookieValue: string): Promise<boolean> {
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return false;
  const [userId, sessionId, sig] = parts;
  if (!userId || !sessionId || !sig) return false;
  if (!UUID_REGEX.test(userId) || !UUID_REGEX.test(sessionId)) return false;
  // sigはHMAC-SHA256 hex = 64桁
  if (sig.length !== 64 || !HEX_REGEX.test(sig)) return false;

  // AUTH_HMAC_SECRET 優先、未設定なら SITE_PASSWORD fallback
  // (middleware は Edge runtime で lib/config/secrets を import 不可な場合あるため直読み)
  const hmacSecret = process.env.AUTH_HMAC_SECRET ?? process.env.SITE_PASSWORD;
  if (!hmacSecret) {
    console.error('AUTH_HMAC_SECRET / SITE_PASSWORD のいずれも設定されていません');
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
    await crypto.subtle.sign('HMAC', key, encoder.encode(`${userId}:${sessionId}`))
  );

  // sig (hex文字列) を Uint8Array に変換してバイト単位で定数時間比較
  const sigBytes = hexToBytes(sig);
  return constantTimeEqualBytes(sigBytes, signatureBytes);
}

// 認証不要なパス
// 注意: /.netlify/functions/* は netlify.toml の force redirect により
// Next.js middleware を経由しない(Netlify 関数ランタイムが直接処理)。
// 各関数側で x-background-secret 等の独自認証を必ず実装すること。
const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/users',  // ユーザー選択ログイン用(name のみ返却)
  '/api/health',
  '/api/tldv/webhook',
];

/** セキュリティヘッダを response に付与 */
function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // パストラバーサル防止
  const decodedPath = decodeURIComponent(pathname);
  if (decodedPath.includes('..') || decodedPath.includes('\0')) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  // 本番環境では HTTPS 必須(MITMダウングレード防止)
  if (process.env.NODE_ENV === 'production') {
    const forwardedProto = request.headers.get('x-forwarded-proto');
    const protocol = forwardedProto ?? request.nextUrl.protocol.replace(':', '');
    if (protocol !== 'https') {
      return new NextResponse('HTTPS required', { status: 400 });
    }
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
      return applySecurityHeaders(NextResponse.redirect(loginUrl));
    }
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    // 静的ファイルと _next を除外
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
