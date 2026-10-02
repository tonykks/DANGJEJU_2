const COOLDOWN_MS = 60_000;
const STORAGE_KEY = 'dangjeju:firestore:quota-cooldown';

export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String(error.code) : '';
  if (code === 'resource-exhausted' || code === 'firestore/resource-exhausted' || code === '429') return true;
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  return /\bRESOURCE_EXHAUSTED\b|\bQuota\s+exceeded\b/i.test(message);
}

function readCooldown(): number {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

let memoryCooldown = 0;

export function assertNotInQuotaCooldown(now = Date.now()): void {
  const until = Math.max(memoryCooldown, readCooldown());
  if (until > now) {
    throw Object.assign(new Error('Firestore quota cooldown active.'), { code: 'resource-exhausted' });
  }
}

export function markQuotaFailure(now = Date.now()): void {
  memoryCooldown = now + COOLDOWN_MS;
  try {
    sessionStorage?.setItem(STORAGE_KEY, String(memoryCooldown));
  } catch {
    /* memory cooldown only */
  }
}
