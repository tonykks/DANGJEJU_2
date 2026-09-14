import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOG_TTL_MS, QUOTA_COOLDOWN_MS, createCatalogLoader, readWithQuotaRetry } from '../src/lib/placesCatalogCache.ts';

const documents = {
  places: [{ id: 'kto-1', path: 'places/kto-1', data: { placeId: 'kto-1', name: '제주 테스트' } }],
  sources: [{ id: 'kto-areaBasedList2-1', path: 'places/kto-1/sources/kto-areaBasedList2-1', data: { source: 'KTO', placeId: 'kto-1', kto: { contentTypeId: '32' } } }],
};
const quota = () => Object.assign(new Error('Quota exceeded.'), { code: 'resource-exhausted' });
function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

test('coalesces concurrent callers and caches completed loads in memory', async () => {
  let reads = 0;
  const load = createCatalogLoader(async () => { reads++; return documents; }, { key: 'memory', storage: () => null });
  const first = load();
  assert.equal(load(), first);
  const catalog = await first;
  assert.equal(await load(), catalog);
  assert.equal(reads, 1);
  assert.equal(catalog.places[0].category, 'stay');
});

test('compressed session cache survives reload, expires without extending TTL, and isolates databases', async () => {
  const storage = memoryStorage(); let time = 1000; let reads = 0;
  const read = async () => { reads++; return documents; };
  const options = { key: 'project:(default)', storage: () => storage, now: () => time };
  const first = await createCatalogLoader(read, options)();
  time += 100;
  const reload = createCatalogLoader(read, options);
  assert.deepEqual(await reload(), first);
  assert.equal(reads, 1);
  await createCatalogLoader(read, { ...options, key: 'project:other' })();
  assert.equal(reads, 2);
  time = 1000 + CATALOG_TTL_MS;
  await reload();
  assert.equal(reads, 3);
});

test('corrupt, wrong-version, invalid-document, and future cache entries cannot poison loads', async () => {
  for (const bad of ['not-base64', { version: 999 }, { version: 1, expiresAt: 1001, documents: { places: [null], sources: [] } },
    { version: 1, expiresAt: 1000 + CATALOG_TTL_MS + 1, documents }]) {
    const storage = memoryStorage(); let reads = 0;
    let stored: string;
    if (typeof bad === 'string') stored = bad;
    else {
      const gzip = new Blob([JSON.stringify(bad)]).stream().pipeThrough(new CompressionStream('gzip'));
      stored = Buffer.from(await new Response(gzip).arrayBuffer()).toString('base64');
    }
    storage.setItem('dangjeju:catalog:v1:corrupt', stored);
    const load = createCatalogLoader(async () => { reads++; return documents; }, { key: 'corrupt', storage: () => storage, now: () => 1000 });
    assert.equal((await load()).counts.places, 1);
    assert.equal(reads, 1);
  }
});

test('storage access and writes may fail without failing the catalog or disabling memory caching', async () => {
  for (const storage of [() => { throw new Error('SecurityError'); }, () => ({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} })]) {
    let reads = 0;
    const load = createCatalogLoader(async () => { reads++; return documents; }, { key: 'unavailable', storage });
    await load(); await load();
    assert.equal(reads, 1);
  }
});

test('quota retries once with jitter, then preserves the error; permission and index errors do not retry', async () => {
  const delays: number[] = []; let reads = 0;
  const read = async () => { reads++; throw quota(); };
  await assert.rejects(readWithQuotaRetry(read, async (ms) => { delays.push(ms); }, () => 0.5), { code: 'resource-exhausted' });
  assert.equal(reads, 2);
  assert.deepEqual(delays, [1125]);
  for (const code of ['permission-denied', 'failed-precondition', 'unavailable']) {
    let attempts = 0;
    await assert.rejects(readWithQuotaRetry(async () => { attempts++; throw Object.assign(new Error(code), { code }); }), { code });
    assert.equal(attempts, 1);
  }
  let attempts = 0;
  assert.equal(await readWithQuotaRetry(async () => { if (++attempts === 1) throw quota(); return 42; }, async () => {}), 42);
});

test('persistent exhaustion cools down manual retry and reload, then permits recovery', async () => {
  const storage = memoryStorage(); let time = 1000; let reads = 0; let fail = true;
  const options = { key: 'cooldown', storage: () => storage, now: () => time };
  const read = async () => { reads++; if (fail) throw quota(); return documents; };
  const load = createCatalogLoader(read, options);
  await assert.rejects(load(), { code: 'resource-exhausted' });
  await assert.rejects(load(), { code: 'resource-exhausted' });
  const reload = createCatalogLoader(read, options);
  await assert.rejects(reload(), { code: 'resource-exhausted' });
  assert.equal(reads, 1);
  time += QUOTA_COOLDOWN_MS; fail = false;
  assert.equal((await reload()).counts.places, 1);
  assert.equal(reads, 2);
  assert.equal(storage.values.has('dangjeju:catalog:v1:cooldown:quota'), false);
});

test('failed joins never become successful cached catalogs', async () => {
  const storage = memoryStorage(); let reads = 0;
  const load = createCatalogLoader(async () => { reads++; return { places: [{ ...documents.places[0], id: 'invalid' }], sources: [] }; }, { key: 'invalid', storage: () => storage });
  await assert.rejects(load(), /Invalid catalog/);
  await assert.rejects(load(), /Invalid catalog/);
  assert.equal(reads, 2);
  assert.equal(storage.values.size, 0);
});
