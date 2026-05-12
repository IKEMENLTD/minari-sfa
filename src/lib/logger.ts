// =============================================================================
// 構造化ロガー (Sentry/Datadog 移行可能 stub)
//
// 現状: console.{error,warn,info} に出力するのみ。
// 将来: Sentry/Datadog/Logtail を入れる時にこの関数だけ差し替えれば良い。
//
// 使い方:
//   import { logError, logWarn, logInfo } from '@/lib/logger';
//   logError('failed to fetch X', { meetingId, err });
//
// ⚠️ PII / 機密情報注意:
//   - Error.stack に PII (ファイルパス、ローカル変数値) が含まれる可能性。
//     本番では Sentry の `beforeSend` フックでスクラビング推奨。
//   - ctx に user_id, email, full_name 等を入れる場合は、外部監視に流れる前提でマスクするか
//     ログ出力先のアクセス制御を確認すること。
//   - SITE_PASSWORD, API key 等の値を ctx に **絶対に** 入れない。
// =============================================================================

type LogContext = Record<string, unknown>;

function format(level: string, msg: string, ctx?: LogContext): string {
  const ts = new Date().toISOString();
  const ctxStr = ctx ? ` ${JSON.stringify(ctx, (_k, v) =>
    v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v
  )}` : '';
  return `[${ts}] [${level}] ${msg}${ctxStr}`;
}

export function logError(msg: string, ctx?: LogContext): void {
  console.error(format('ERROR', msg, ctx));
  // TODO[ops]: Sentry.captureException(ctx?.err, { extra: ctx, tags: { msg } });
}

export function logWarn(msg: string, ctx?: LogContext): void {
  console.warn(format('WARN', msg, ctx));
  // TODO[ops]: Sentry.captureMessage(msg, { level: 'warning', extra: ctx });
}

export function logInfo(msg: string, ctx?: LogContext): void {
  // 本番は info を抑制したい場合は環境変数で制御
  if (process.env.LOG_LEVEL === 'silent') return;
  console.info(format('INFO', msg, ctx));
}

// =============================================================================
// Sentry 導入時の参考実装(コメント): PII/機密を beforeSend で確実にマスクする
// =============================================================================
//
// import * as Sentry from '@sentry/nextjs';
//
// const SECRET_KEY_PATTERNS = [/password/i, /api_key/i, /secret/i, /token/i, /hmac/i];
// const PII_KEYS = ['email', 'phone', 'full_name', 'ip', 'user_agent'];
//
// function redactValue(value: unknown): unknown {
//   if (typeof value !== 'string') return value;
//   // メールアドレスを部分マスク: naito@example.com → n***@example.com
//   return value.replace(/([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]*(@[^\s]+)/g, '$1***$2');
// }
//
// function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
//   const cleaned: Record<string, unknown> = {};
//   for (const [k, v] of Object.entries(obj)) {
//     if (SECRET_KEY_PATTERNS.some((re) => re.test(k))) {
//       cleaned[k] = '[REDACTED]';
//       continue;
//     }
//     if (PII_KEYS.includes(k.toLowerCase())) {
//       cleaned[k] = redactValue(v);
//       continue;
//     }
//     if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Error)) {
//       cleaned[k] = scrubObject(v as Record<string, unknown>);
//       continue;
//     }
//     cleaned[k] = v;
//   }
//   return cleaned;
// }
//
// Sentry.init({
//   dsn: process.env.SENTRY_DSN,
//   beforeSend(event) {
//     // exception の stack frame からファイルパスを匿名化(必要なら)
//     if (event.exception?.values) {
//       for (const ex of event.exception.values) {
//         if (ex.stacktrace?.frames) {
//           for (const f of ex.stacktrace.frames) {
//             // ローカルパスは prefix を削除して相対化
//             if (f.filename) f.filename = f.filename.replace(/^.*\/sfa-system\//, '');
//           }
//         }
//       }
//     }
//     // extra context をスクラブ
//     if (event.extra) {
//       event.extra = scrubObject(event.extra as Record<string, unknown>);
//     }
//     return event;
//   },
// });
