import { ConvexError } from 'convex/values';

/**
 * Convex throws ConvexError with our structured payload; Better Auth returns
 * `{ error: { message } }`. Everything else gets a readable fallback so the
 * UI never shows a raw stack trace.
 */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Try again.') {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string } | string | undefined;
    if (typeof data === 'string') return data;
    if (data?.message) return data.message;
  }

  if (error && typeof error === 'object') {
    const maybe = error as { message?: string; error?: { message?: string } };
    if (maybe.error?.message) return maybe.error.message;
    if (maybe.message) {
      // Convex wraps server errors; keep only the human part.
      const cleaned = maybe.message.split('\n')[0].replace(/^\[.*?\]\s*/, '').trim();
      if (cleaned && !cleaned.startsWith('Uncaught')) return cleaned;
    }
  }

  if (typeof error === 'string') return error;
  return fallback;
}

/**
 * The structured code from one of our ConvexError payloads. The error can
 * arrive as a real ConvexError or, once it has crossed a boundary, as a plain
 * object with the payload inlined in the message, so both shapes are read.
 */
export function errorCode(error: unknown): string | null {
  const data = error && typeof error === 'object' ? (error as { data?: unknown }).data : undefined;
  if (data && typeof data === 'object') {
    const code = (data as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }

  const message =
    error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : '';
  const match = message.match(/"code":"([A-Z_]+)"/);
  return match ? match[1] : null;
}

export function isNetworkError(error: unknown) {
  const message = errorMessage(error, '').toLowerCase();
  return (
    message.includes('network') || message.includes('fetch') || message.includes('timed out')
  );
}
