import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateAuth, isAuthError } from '@/lib/auth';
import { exportMeetingToDoc, checkExistingDoc } from '@/lib/export-to-doc';
import type { ApiResult } from '@/types';

const uuidSchema = z.string().uuid();

interface ExportResult {
  docUrl: string;
  isNew: boolean;
}

interface DocCheckResult {
  exists: boolean;
  docUrl: string | null;
  companyName: string | null;
}

/**
 * GET: 既存Docの有無を確認（上書き確認ポップアップ用）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResult<DocCheckResult>>> {
  const authResult = await validateAuth(request);
  if (isAuthError(authResult)) return authResult as NextResponse<ApiResult<DocCheckResult>>;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json(
        { data: null, error: '無効なIDフォーマットです' },
        { status: 400 }
      );
    }

    const result = await checkExistingDoc(id);
    return NextResponse.json({ data: result, error: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json(
      { data: null, error: msg },
      { status: 500 }
    );
  }
}

/**
 * POST: Google Docsに書き出し（新規作成 or 上書き）
 */
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
    return NextResponse.json({ data: result, error: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '不明なエラー';
    console.error('Google Docs書き出しエラー:', msg);

    const is4xx = msg.includes('企業名が未設定') || msg.includes('社内会議') || msg.includes('商談データが見つかりません');
    return NextResponse.json(
      { data: null, error: `Google Docs書き出し失敗: ${msg}` },
      { status: is4xx ? 400 : 500 }
    );
  }
}
