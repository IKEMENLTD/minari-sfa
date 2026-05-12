import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual, randomUUID, createHmac } from 'crypto';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAuthHmacSecret } from '@/lib/config/secrets';

const COOKIE_NAME = 'sd_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7日(セキュリティのため30日→7日に短縮)

const loginBodySchema = z.object({
  user_id: z.string().uuid('user_id は有効なUUIDを指定してください'),
  password: z.string().min(1).max(200),
});

// ブルートフォース対策: IP + user_id 複合キーのレート制限
// 単一IPからの user 列挙、および分散攻撃に対しても user_id 単位で防御。
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5; // 5回失敗で1分ロック
const LOCKOUT_MS = 60_000;

function checkLoginRate(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOCKOUT_MS });
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

  // IP単位の上限を先に確認(payload解析より前にブロック)
  if (!checkLoginRate(`ip:${ip}`)) {
    return NextResponse.json(
      { error: 'ログイン試行回数の上限に達しました。しばらく待ってから再試行してください。' },
      { status: 429 }
    );
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsed = loginBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: '入力値が不正です' }, { status: 400 });
  }
  const { user_id: userId, password } = parsed.data;

  // user_id 単位でも上限。分散IPからの単一ユーザー狙い撃ちを防ぐ。
  if (!checkLoginRate(`user:${userId}`)) {
    return NextResponse.json(
      { error: 'ログイン試行回数の上限に達しました。しばらく待ってから再試行してください。' },
      { status: 429 }
    );
  }

  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword) {
    return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 });
  }

  // 列挙攻撃対策 + race condition 回避:
  //   - パスワード検証(同期, μs単位)とDB lookup(数ms)を **並列実行**
  //   - 失敗ケースの分岐(user存在せず / password間違い)で response 時間が変動しない
  //   - 順序依存(先にuser確認するとTOCTOU窓ができる)を排除
  const supabase = createServerSupabaseClient();
  const lookupUser = async (): Promise<{ ok: boolean; threw?: boolean }> => {
    try {
      const { data, error } = await supabase.from('users').select('id').eq('id', userId).single();
      return { ok: !error && !!data };
    } catch (err) {
      console.error('users lookup error:', err instanceof Error ? err.message : err);
      return { ok: false, threw: true };
    }
  };
  const [passwordOk, userQuery] = await Promise.all([
    Promise.resolve(safeCompare(password, sitePassword)),
    lookupUser(),
  ]);

  if (userQuery.threw) {
    return NextResponse.json({ error: 'ログイン処理中にエラーが発生しました' }, { status: 500 });
  }

  if (!passwordOk || !userQuery.ok) {
    return NextResponse.json({ error: '認証失敗' }, { status: 401 });
  }

  // 成功時はIPとuser両方のカウンターリセット
  loginAttempts.delete(`ip:${ip}`);
  loginAttempts.delete(`user:${userId}`);

  // HMAC署名付きセッショントークンを生成
  //   形式: {userId}.{sessionId}.{hmac(userId + ':' + sessionId)}
  // userId をトークンに埋め込むことで、API側で users.role を DB lookup できる。
  // 署名鍵は AUTH_HMAC_SECRET 優先(SITE_PASSWORD fallback): SITE_PASSWORD ローテーション時の全員DoS回避
  const sessionId = randomUUID();
  const hmacSecret = getAuthHmacSecret();
  if (!hmacSecret) {
    return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 });
  }
  const signature = createHmac('sha256', hmacSecret)
    .update(`${userId}:${sessionId}`)
    .digest('hex');
  const token = `${userId}.${sessionId}.${signature}`;

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
