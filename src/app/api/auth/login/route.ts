import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'sd_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30日

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { password } = body as { password?: string };

  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword) {
    return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 });
  }

  if (!password || password !== sitePassword) {
    return NextResponse.json({ error: '認証失敗' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, 'authenticated', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
  return response;
}
