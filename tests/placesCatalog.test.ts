import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore/lite';
import {
  SOURCE_PLACE_ID_IN_LIMIT,
  catalogPlaceIdsForSourceQuery,
  loadPlacesCatalog,
  readKtoSourcesByPlaceIds,
} from '../src/lib/placesCatalog.ts';

function queryResponse(project: string, sources: boolean, count: number, startId = 1) {
  return Array.from({ length: count }, (_, index) => {
    const id = startId + index;
    const path = `places/kto-${id}${sources ? `/sources/kto-areaBasedList2-${id}` : ''}`;
    return { document: {
      name: `projects/${project}/databases/(default)/documents/${path}`,
      fields: sources
        ? { source: { stringValue: 'KTO' }, placeId: { stringValue: `kto-${id}` } }
        : { placeId: { stringValue: `kto-${id}` }, name: { stringValue: `Place ${id}` } },
      createTime: '2026-01-01T00:00:00Z', updateTime: '2026-01-01T00:00:00Z',
    }, readTime: '2026-01-01T00:00:00Z' };
  });
}

function extractInValues(structuredQuery: any): string[] {
  const composite = structuredQuery.where?.compositeFilter;
  const filters = composite?.filters ?? [structuredQuery.where];
  const placeFilter = filters.find((entry: any) => entry.fieldFilter?.field?.fieldPath === 'placeId');
  return (placeFilter?.fieldFilter?.value?.arrayValue?.values ?? []).map((v: any) => v.stringValue);
}

test('catalogPlaceIdsForSourceQuery keeps only kto-<digits> ids', () => {
  assert.deepEqual(
    catalogPlaceIdsForSourceQuery([
      { id: 'kto-1', path: 'places/kto-1', data: {} },
      { id: 'bad', path: 'places/bad', data: {} },
      { id: 'kto-22', path: 'places/kto-22', data: {} },
    ]),
    ['kto-1', 'kto-22'],
  );
});

test('readKtoSourcesByPlaceIds batches at Firestore in-limit', async () => {
  const ids = Array.from({ length: 65 }, (_, i) => `kto-${i + 1}`);
  const batches: string[][] = [];
  const sources = await readKtoSourcesByPlaceIds(ids, async (batch) => {
    batches.push(batch);
    return batch.map((id) => ({ id: `src-${id}`, path: `places/${id}/sources/x`, data: { source: 'KTO', placeId: id } }));
  });
  assert.equal(batches.length, 3);
  assert.equal(batches[0].length, SOURCE_PLACE_ID_IN_LIMIT);
  assert.equal(batches[1].length, SOURCE_PLACE_ID_IN_LIMIT);
  assert.equal(batches[2].length, 5);
  assert.equal(sources.length, 65);
});

test('2,126 places issue one places query and batched KTO source collection-group queries', async (t) => {
  const project = 'demo-catalog-request-count';
  const app = initializeApp({ projectId: project }, project);
  const requests: { url: string; query: any }[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const payload = await request.json();
    requests.push({ url: request.url, query: payload.structuredQuery });
    assert.equal(request.url, `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery`);
    assert.equal(request.method, 'POST');
    const isSources = payload.structuredQuery.from[0].collectionId === 'sources';
    if (!isSources) {
      return new Response(JSON.stringify(queryResponse(project, false, 2126)), { headers: { 'Content-Type': 'application/json' } });
    }
    const ids = extractInValues(payload.structuredQuery);
    assert.ok(ids.length <= SOURCE_PLACE_ID_IN_LIMIT);
    const startId = Number(ids[0].slice(4));
    return new Response(JSON.stringify(queryResponse(project, true, ids.length, startId)), { headers: { 'Content-Type': 'application/json' } });
  });
  try {
    const db = getFirestore(app);
    const first = loadPlacesCatalog(db);
    assert.equal(loadPlacesCatalog(db), first);
    const result = await first;
    assert.deepEqual(result.counts, {
      places: 2126, sources: 2126, known: 0, unknown: 2126, mapped: 0, missingSources: 0, unmatchedSources: 0,
    });
    assert.deepEqual(requests[0].query.from, [{ collectionId: 'places' }]);
    assert.equal(requests[0].query.where, undefined);
    const sourceRequests = requests.slice(1);
    assert.equal(sourceRequests.length, Math.ceil(2126 / SOURCE_PLACE_ID_IN_LIMIT));
    for (const entry of sourceRequests) {
      assert.deepEqual(entry.query.from, [{ collectionId: 'sources', allDescendants: true }]);
      const filters = entry.query.where.compositeFilter.filters;
      assert.equal(entry.query.where.compositeFilter.op, 'AND');
      assert.deepEqual(filters[0], {
        fieldFilter: { field: { fieldPath: 'source' }, op: 'EQUAL', value: { stringValue: 'KTO' } },
      });
      assert.equal(filters[1].fieldFilter.field.fieldPath, 'placeId');
      assert.equal(filters[1].fieldFilter.op, 'IN');
      assert.ok(filters[1].fieldFilter.value.arrayValue.values.length <= SOURCE_PLACE_ID_IN_LIMIT);
    }
    assert.equal(await loadPlacesCatalog(db), result);
    assert.equal(requests.length, 1 + sourceRequests.length);
  } finally { await deleteApp(app); }
});

test('quota failure retries only the source batch pass and does not reread successful places', async (t) => {
  const project = 'demo-catalog-quota-retry';
  const app = initializeApp({ projectId: project }, project);
  const reads: string[] = [];
  let sourceAttempts = 0;
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    assert.ok(request.url.includes(`/projects/${project}/`));
    assert.ok(request.url.endsWith('documents:runQuery'));
    const { structuredQuery } = await request.json();
    const collection = structuredQuery.from[0].collectionId;
    reads.push(collection);
    if (collection === 'sources') {
      sourceAttempts += 1;
      if (sourceAttempts === 1) {
        return new Response(JSON.stringify({
          error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded.' },
        }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      }
      const ids = extractInValues(structuredQuery);
      const startId = Number(ids[0].slice(4));
      return new Response(JSON.stringify(queryResponse(project, true, ids.length, startId)), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(queryResponse(project, false, 1)), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
  try {
    const result = await loadPlacesCatalog(getFirestore(app));
    assert.equal(result.counts.sources, 1);
    assert.deepEqual(reads, ['places', 'sources', 'sources']);
  } finally { await deleteApp(app); }
});
