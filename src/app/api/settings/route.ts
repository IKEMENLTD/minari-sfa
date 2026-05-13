import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, validateContentType, isAuthError, requireRole } from '@/lib/auth';
import { isEnvOnlyKey } from '@/lib/config/secrets';
import {
  encryptSetting,
  decryptSetting,
  isEncryptedValue,
  isEncryptableKey,
  maskSecret,
} from '@/lib/crypto/settings-cipher';
import type { ApiResult } from '@/types';

interface SettingItem {
  key: string;
  value: string;
  updated_at: string;
  /** 暗号化対象キーの場合 true (UI表示の区別用) */
  is_secret?: boolean;
  /** 値が暗号化形式で保存されているか */
  is_encrypted?: boolean;
}

// =============================================================================
// GET /api/settings
// admin のみ。暗号化値は復号後、末尾4文字のみ可視化(mask)して返す。
// =============================================================================
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
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('app_settings テーブルが存在しません。003_settings.sql を適用してください。');
        return NextResponse.json({ data: [] as SettingItem[], error: null });
      }
      console.error('設定の取得に失敗しました:', error.message);
      return NextResponse.json({ data: null, error: '設定の取得に失敗しました' }, { status: 500 });
    }

    const items: SettingItem[] = (data ?? []).map((s) => {
      const encrypted = isEncryptedValue(s.value);
      const secret = isEncryptableKey(s.key) || s.key.includes('key') || s.key.includes('secret');

      let displayValue = s.value;
      if (encrypted) {
        try {
          const plain = decryptSetting(s.value);
          displayValue = maskSecret(plain);
        } catch (e) {
          console.error(`復号失敗: ${s.key}`, e instanceof Error ? e.message : e);
          displayValue = '****(復号失敗)';
        }
      } else if (secret) {
        // 平文の機密値(レガシー or 暗号化対象外の secret 風キー)もマスク
        displayValue = maskSecret(s.value);
      }

      return {
        key: s.key,
        value: displayValue,
        updated_at: s.updated_at,
        is_secret: secret,
        is_encrypted: encrypted,
      };
    });

    return NextResponse.json({ data: items, error: null });
  } catch (err) {
    console.error('設定の取得中にエラー:', err instanceof Error ? err.message : err);
    return NextResponse.json({ data: null, error: '設定の取得中にエラーが発生しました' }, { status: 500 });
  }
}

const updateSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().max(5000),
});

// =============================================================================
// PATCH /api/settings
// 暗号化対象キーは AES-256-GCM で暗号化して保存。
// =============================================================================
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

    // ⚠️ 評価順が重要:
    //   1) ENCRYPTABLE_KEYS (claude_api_key 等) → 暗号化保存OK
    //   2) ENV_ONLY_KEYS (auth_hmac_secret 等) → 400 拒否
    //   3) SECRET_LIKE_PATTERNS (`_api_key$` 等) → 400 拒否
    //  claude_api_key は `_api_key$` パターンに合致するが、ENCRYPTABLE_KEYS で先に救う設計。
    let storedValue = parsed.data.value;
    if (isEncryptableKey(parsed.data.key)) {
      // 暗号化対象 — 空値拒否は先に
      if (!parsed.data.value.trim()) {
        return NextResponse.json({ data: null, error: 'APIキー/シークレットは空にできません' }, { status: 400 });
      }
      try {
        storedValue = encryptSetting(parsed.data.value);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '暗号化に失敗しました';
        console.error('暗号化失敗:', msg);
        return NextResponse.json(
          { data: null, error: `暗号化に失敗しました: ${msg}(SETTINGS_ENCRYPTION_KEY 未設定の可能性)` },
          { status: 500 }
        );
      }
    } else if (isEnvOnlyKey(parsed.data.key)) {
      // env-only(SECRET_LIKE_PATTERNS含む)で encryptable でない → 拒否
      return NextResponse.json(
        { data: null, error: 'このキーはセキュリティ上、画面からは保存できません(Netlify環境変数のみ)。' },
        { status: 400 }
      );
    } else if ((parsed.data.key.endsWith('_key') || parsed.data.key.endsWith('_secret')) && !parsed.data.value.trim()) {
      // 通常キーでも _key/_secret 接尾辞は空値拒否
      return NextResponse.json({ data: null, error: 'APIキー/シークレットは空にできません' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from('app_settings')
      .upsert(
        { key: parsed.data.key, value: storedValue, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return NextResponse.json({ data: null, error: 'app_settingsテーブルが未作成です。' }, { status: 500 });
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

// =============================================================================
// DELETE /api/settings?key=...
// =============================================================================
export async function DELETE(request: NextRequest): Promise<NextResponse<ApiResult<{ success: boolean }>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<{ success: boolean }>>;
  const roleError = requireRole(auth, ['admin']);
  if (roleError) return roleError as NextResponse<ApiResult<{ success: boolean }>>;

  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    if (!key) {
      return NextResponse.json({ data: null, error: 'キーが指定されていません' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from('app_settings').delete().eq('key', key);

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return NextResponse.json({ data: null, error: 'app_settingsテーブルが未作成です' }, { status: 500 });
      }
      console.error('設定の削除に失敗しました:', error.message);
      return NextResponse.json({ data: null, error: '設定の削除に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (err) {
    console.error('設定の削除中にエラー:', err instanceof Error ? err.message : err);
    return NextResponse.json({ data: null, error: '設定の削除中にエラーが発生しました' }, { status: 500 });
  }
}
