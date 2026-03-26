import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * サーバー用 Supabase クライアントを生成する。
 * service_role キーを使用するため、RLS を完全にバイパスする。
 *
 * SECURITY NOTE:
 * このクライアントは RLS ポリシーを無視するため、アクセス制御は
 * 呼び出し元の API ルートで validateAuth() + requireRole() により
 * アプリケーション層で必ず実施すること。
 * RLS はクライアント（anon key）直接アクセスに対する防御層として機能する。
 *
 * リクエストごとに新しいインスタンスを生成することを推奨。
 */
export function createServerSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('環境変数 NEXT_PUBLIC_SUPABASE_URL が設定されていません');
  }
  if (!serviceRoleKey) {
    throw new Error('環境変数 SUPABASE_SERVICE_ROLE_KEY が設定されていません');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
