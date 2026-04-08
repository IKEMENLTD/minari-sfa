import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual, randomUUID, createHmac } from 'crypto';

const COOKIE_NAME = 'sd_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30日

// ブルートフォース対策: IPベースのレート制限
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5; // 5回失敗で1分ロック
const LOCKOUT_MS = 60_000;

function checkLoginRate(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOCKOUT_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

// 定数時間のパスワード比較（タイミング攻撃防止）
function safeCompare(input: string, expected: string): boolean {
  const inputBuf = Buffer.from(input, 'utf-8');
  const expectedBuf = Buffer.from(expected, 'utf-8');
  if (inputBuf.length !== expectedBuf.length) {
    // 長さが異なっても定数時間で比較（ダミー比較）
    timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }
  return timingSafeEqual(inputBuf, expectedBuf);
}

export async function POST(request: NextRequest) {
  // IPアドレス取得（A3: Netlify固有の信頼できるIPヘッダーを優先）
  const ip =
    request.headers.get('x-nf-client-connection-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';

  if (!checkLoginRate(ip)) {
    return NextResponse.json(
      { error: 'ログイン試行回数の上限に達しました。しばらく待ってから再試行してください。' },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { password } = body as { password?: string };

  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword) {
    return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 });
  }

  if (!password || !safeCompare(password, sitePassword)) {
    return NextResponse.json({ error: '認証失敗' }, { status: 401 });
  }

  // 成功時はカウンターリセット
  loginAttempts.delete(ip);

  // HMAC署名付きセッショントークンを生成（認証バイパス防止）
  const sessionId = randomUUID();
  const hmacSecret = process.env.SITE_PASSWORD ?? 'fallback-secret';
  const signature = createHmac('sha256', hmacSecret).update(sessionId).digest('hex');
  const token = `${sessionId}.${signature}`;

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
  return response;
}
