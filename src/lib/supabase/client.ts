import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;

/**
 * ブラウザ用 Supabase クライアントを取得する。
 * 遅延初期化により、環境変数未設定時のビルドエラーを回避する。
 */
export function getSupabaseClient(): SupabaseClient {
  if (_supabase) return _supabase;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('環境変数 NEXT_PUBLIC_SUPABASE_URL が設定されていません');
  }
  if (!supabaseAnonKey) {
    throw new Error('環境変数 NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていません');
  }

  _supabase = createClient(supabaseUrl, supabaseAnonKey);
  return _supabase;
}
