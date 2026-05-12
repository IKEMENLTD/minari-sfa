import { NextRequest, NextResponse } from 'next/server';
import { clearRoleCache, extractUserIdUnsafe } from '@/lib/auth';

const COOKIE_NAME = 'sd_auth';

export async function POST(request: NextRequest) {
  // logout時にサーバー側 roleCache もクリア(再ログイン後の role downgrade を即時反映)
  const cookie = request.cookies.get(COOKIE_NAME);
  const userId = extractUserIdUnsafe(cookie?.value);
  if (userId) {
    clearRoleCache(userId);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
  return response;
}
