import { joinPlacesCatalog, type CatalogDocument } from './placeAdapter.ts';

export type CatalogDocuments = { places: CatalogDocument[]; sources: CatalogDocument[] };
type PlacesCatalog = ReturnType<typeof joinPlacesCatalog>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const CATALOG_TTL_MS = 15 * 60 * 1000;
export const QUOTA_COOLDOWN_MS = 60 * 1000;
const CACHE_VERSION = 1;

export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return error.code === 'resource-exhausted' || error.code === 'firestore/resource-exhausted';
}

// One retry of the failed read only; never replay successful places/source reads.
export async function readWithQuotaRetry<T>(
  read: () => Promise<T>,
  sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  random = Math.random,
): Promise<T> {
  try { return await read(); }
  catch (error) {
    if (!isQuotaError(error)) throw error;
    await sleep(1000 + Math.floor(random() * 250));
    return read();
  }
}

function sessionStorageOrNull(): StorageLike | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; }
  catch { return null; }
}

function validDocuments(value: unknown): value is CatalogDocument[] {
  return Array.isArray(value) && value.every((doc) => doc && typeof doc.id === 'string'
    && typeof doc.path === 'string' && doc.data && typeof doc.data === 'object' && !Array.isArray(doc.data));
}

// The 2,126-place catalog exceeds common sessionStorage limits as plain JSON.
// Native gzip keeps reload caching small without adding a compression dependency.
async function compress(value: unknown): Promise<string> {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}

async function decompress(value: string): Promise<unknown> {
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

export function createCatalogLoader(
  read: () => Promise<CatalogDocuments>,
  options: { key: string; storage?: () => StorageLike | null; now?: () => number },
): () => Promise<PlacesCatalog> {
  const now = options.now ?? Date.now;
  const getStorage = options.storage ?? sessionStorageOrNull;
  const cacheKey = `dangjeju:catalog:v${CACHE_VERSION}:${options.key}`;
  const cooldownKey = `${cacheKey}:quota`;
  let memory: { expiresAt: number; catalog: PlacesCatalog } | null = null;
  let inFlight: Promise<PlacesCatalog> | null = null;
  let retryAfter = 0;

  const storage = () => { try { return getStorage(); } catch { return null; } };
  const remove = (key: string) => { try { storage()?.removeItem(key); } catch { /* Optional cache. */ } };

  async function load(): Promise<PlacesCatalog> {
    const cachedAt = now();
    try {
      const stored = storage()?.getItem(cacheKey);
      if (stored) {
        const entry = await decompress(stored) as { version?: number; expiresAt?: number; documents?: CatalogDocuments };
        if (entry?.version === CACHE_VERSION && Number.isFinite(entry.expiresAt)
          && entry.expiresAt! > now() && entry.expiresAt! <= cachedAt + CATALOG_TTL_MS
          && validDocuments(entry.documents?.places) && validDocuments(entry.documents?.sources)) {
          const catalog = joinPlacesCatalog(entry.documents!.places, entry.documents!.sources);
          memory = { expiresAt: entry.expiresAt!, catalog };
          return catalog;
        }
        remove(cacheKey);
      }
    } catch { remove(cacheKey); }

    try {
      const persistedRetry = Number(storage()?.getItem(cooldownKey));
      if (persistedRetry > now() && persistedRetry <= now() + QUOTA_COOLDOWN_MS) {
        retryAfter = Math.max(retryAfter, persistedRetry);
      }
    } catch { /* Keep the memory cooldown when session storage is blocked. */ }
    if (retryAfter > now()) {
      throw Object.assign(new Error('Catalog quota retry is cooling down.'), { code: 'resource-exhausted' });
    }

    try {
      const documents = await read();
      const catalog = joinPlacesCatalog(documents.places, documents.sources);
      const expiresAt = now() + CATALOG_TTL_MS;
      memory = { expiresAt, catalog };
      retryAfter = 0;
      remove(cooldownKey);
      try {
        const target = storage();
        if (target) target.setItem(cacheKey, await compress({ version: CACHE_VERSION, expiresAt, documents }));
      } catch { /* Unsupported compression, disabled storage, or full storage: memory still works. */ }
      return catalog;
    } catch (error) {
      if (isQuotaError(error)) {
        retryAfter = now() + QUOTA_COOLDOWN_MS;
        try { storage()?.setItem(cooldownKey, String(retryAfter)); } catch { /* Memory cooldown remains. */ }
      }
      throw error;
    }
  }

  return () => {
    if (inFlight) return inFlight;
    if (memory && memory.expiresAt > now()) return Promise.resolve(memory.catalog);
    memory = null;
    inFlight = load().finally(() => { inFlight = null; });
    return inFlight;
  };
}
