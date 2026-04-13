import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, validateContentType, isAuthError, requireRole } from '@/lib/auth';
import type { ApiResult } from '@/types';

interface SettingItem {
  key: string;
  value: string;
  updated_at: string;
}

// GET /api/settings
export async function GET(request: NextRequest): Promise<NextResponse<ApiResult<SettingItem[]>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<SettingItem[]>>;
  const roleError = requireRole(auth, ['admin']);
  if (roleError) return roleError as NextResponse<ApiResult<SettingItem[]>>;

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value, updated_at')
      .order('key');

    if (error) {
      // テーブルが存在しない場合は空配列を返す（マイグレーション未適用時）
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('app_settings テーブルが存在しません。Supabase SQL Editor で 003_settings.sql を実行してください。');
        return NextResponse.json({ data: [] as SettingItem[], error: null, warning: 'app_settingsテーブルが未作成です。Supabase SQL Editorでマイグレーションを実行してください。' });
      }
      console.error('設定の取得に失敗しました:', error.message);
      return NextResponse.json({ data: null, error: '設定の取得に失敗しました' }, { status: 500 });
    }

    // Mask sensitive values
    const masked = (data ?? []).map((s) => ({
      ...s,
      value: s.key.includes('key') || s.key.includes('secret')
        ? (s.value.length > 4 ? '****' + s.value.slice(-4) : '****')
        : s.value,
    }));

    return NextResponse.json({ data: masked as SettingItem[], error: null });
  } catch (err) {
    console.error('設定の取得中にエラー:', err instanceof Error ? err.message : err);
    return NextResponse.json({ data: null, error: '設定の取得中にエラーが発生しました' }, { status: 500 });
  }
}

const updateSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().max(500),
});

// PATCH /api/settings
export async function PATCH(request: NextRequest): Promise<NextResponse<ApiResult<{ success: boolean }>>> {
  const contentTypeError = validateContentType(request);
  if (contentTypeError) return contentTypeError as NextResponse<ApiResult<{ success: boolean }>>;

  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<{ success: boolean }>>;
  const roleError = requireRole(auth, ['admin']);
  if (roleError) return roleError as NextResponse<ApiResult<{ success: boolean }>>;

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ data: null, error: '入力値が不正です' }, { status: 400 });
    }

    // For keys ending with '_key' or '_secret', validate non-empty
    if ((parsed.data.key.endsWith('_key') || parsed.data.key.endsWith('_secret')) && !parsed.data.value.trim()) {
      return NextResponse.json({ data: null, error: 'APIキー/シークレットは空にできません' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from('app_settings')
      .upsert(
        { key: parsed.data.key, value: parsed.data.value, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return NextResponse.json({ data: null, error: 'app_settingsテーブルが未作成です。Supabase SQL Editorで003_settings.sqlを実行してください。' }, { status: 500 });
      }
      console.error('設定の保存に失敗しました:', error.message);
      return NextResponse.json({ data: null, error: '設定の保存に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (err) {
    console.error('設定の保存中にエラー:', err instanceof Error ? err.message : err);
    return NextResponse.json({ data: null, error: '設定の保存中にエラーが発生しました' }, { status: 500 });
  }
}
