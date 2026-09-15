const COOLDOWN_MS = 60_000;
const STORAGE_KEY = 'dangjeju:firestore:quota-cooldown';

export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  const code = String((error as { code: unknown }).code);
  return code === 'resource-exhausted' || code === 'firestore/resource-exhausted';
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
