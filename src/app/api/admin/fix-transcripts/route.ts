import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateAuth, isAuthError, requireRole } from '@/lib/auth';
import type { ApiResult } from '@/types';

export async function POST(request: NextRequest): Promise<NextResponse<ApiResult<{ fixed: number }>>> {
  const auth = await validateAuth(request);
  if (isAuthError(auth)) return auth as NextResponse<ApiResult<{ fixed: number }>>;
  const roleError = requireRole(auth, ['admin']);
  if (roleError) return roleError as NextResponse<ApiResult<{ fixed: number }>>;

  try {
    const supabase = createServerSupabaseClient();
    const { data: transcripts } = await supabase
      .from('transcripts')
      .select('id, full_text');

    let fixed = 0;
    for (const t of transcripts ?? []) {
      const raw = t.full_text as string;
      if (!raw || (!raw.startsWith('{') && !raw.startsWith('['))) continue;

      try {
        const parsed = JSON.parse(raw);
        let text: string | null = null;

        if (parsed.data && Array.isArray(parsed.data)) {
          text = parsed.data
            .map((s: Record<string, unknown>) => {
              const speaker = s.speaker_name ?? s.speaker ?? '';
              const content = s.text ?? s.content ?? '';
              return speaker ? `${speaker}: ${content}` : String(content);
            })
            .filter(Boolean)
            .join('\n');
        } else if (Array.isArray(parsed.segments ?? parsed.entries)) {
          const segments = parsed.segments ?? parsed.entries;
          text = segments
            .map((s: Record<string, unknown>) => {
              const speaker = s.speaker_name ?? s.speaker ?? '';
              const content = s.text ?? s.content ?? '';
              return speaker ? `${speaker}: ${content}` : String(content);
            })
            .filter(Boolean)
            .join('\n');
        } else if (typeof parsed.text === 'string') {
          text = parsed.text;
        }

        if (text && text !== raw) {
          await supabase
            .from('transcripts')
            .update({ full_text: text })
            .eq('id', t.id);
          fixed++;
        }
      } catch {
        // Skip unparseable records
      }
    }

    return NextResponse.json({ data: { fixed }, error: null });
  } catch (err) {
    console.error('議事録修正中にエラー:', err instanceof Error ? err.message : err);
    return NextResponse.json({ data: null, error: '議事録修正中にエラーが発生しました' }, { status: 500 });
  }
}
