import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateAuth, isAuthError, requireRole, clearRoleCache } from '@/lib/auth';
import type { ApiResult } from '@/types';

const bodySchema = z.object({
  user_id: z.string().uuid().optional(),
}).strict();

/**
 * POST /api/auth/refresh-role
 * 指定 user_id の roleCache を即時無効化する。
 * - admin/manager が users.role を変更した直後に呼ぶことで 5分の遅延を回避。
 * - body 省略時は全キャッシュをクリア。
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResult<{ cleared: boolean }>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<{ cleared: boolean }>>;

  const roleError = requireRole(auth, ['admin', 'manager']);
  if (roleError) return roleError as NextResponse<ApiResult<{ cleared: boolean }>>;

  const rawBody = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: '入力値が不正です' }, { status: 400 });
  }

  clearRoleCache(parsed.data.user_id);
  return NextResponse.json({ data: { cleared: true }, error: null });
}
