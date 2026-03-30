import { NextRequest, NextResponse } from 'next/server';
import { validateAuth, requireRole, isAuthError } from '@/lib/auth';
import { syncAllToSheet } from '@/lib/external/google-sheets';
import type { ApiResult } from '@/types';

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID ?? '';

interface SyncResult {
  companyCount: number;
  meetingCount: number;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResult<SyncResult>>> {
  const authResult = await validateAuth(request);
  if (isAuthError(authResult)) return authResult as NextResponse<ApiResult<SyncResult>>;

  const roleError = requireRole(authResult, ['admin', 'manager']);
  if (roleError) return roleError as NextResponse<ApiResult<SyncResult>>;

  if (!GOOGLE_SHEET_ID) {
    return NextResponse.json(
      { data: null, error: 'GOOGLE_SHEET_ID が未設定です' },
      { status: 500 }
    );
  }

  try {
    const result = await syncAllToSheet(GOOGLE_SHEET_ID);
    return NextResponse.json({ data: result, error: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '不明なエラー';
    console.error('スプレッドシート同期エラー:', msg);
    return NextResponse.json(
      { data: null, error: `スプレッドシート同期に失敗しました: ${msg}` },
      { status: 500 }
    );
  }
}
