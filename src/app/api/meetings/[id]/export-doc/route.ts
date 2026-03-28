import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateAuth, isAuthError } from '@/lib/auth';
import { exportMeetingToDoc } from '@/lib/export-to-doc';
import type { ApiResult } from '@/types';

const uuidSchema = z.string().uuid();

interface ExportResult {
  docUrl: string;
  isNew: boolean;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<ExportResult>>> {
  const authResult = await validateAuth(request);
  if (isAuthError(authResult)) return authResult as NextResponse<ApiResult<ExportResult>>;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json(
        { data: null, error: '無効なIDフォーマットです' },
        { status: 400 }
      );
    }

    const result = await exportMeetingToDoc(id);

    if (!result) {
      return NextResponse.json(
        { data: null, error: 'Google Docsへの書き出しに失敗しました（企業名不明または環境変数未設定）' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: result, error: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '不明なエラー';
    console.error('Google Docs書き出しエラー:', msg);
    return NextResponse.json(
      { data: null, error: `Google Docs書き出し失敗: ${msg}` },
      { status: 500 }
    );
  }
}
