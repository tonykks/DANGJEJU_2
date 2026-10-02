import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { isCanonicalPlaceSource, isPlaceId, ownerPlaceIdentity } from '../src/lib/placeIdentity';
import { adaptPlace, adaptPlaceDocs } from '../src/lib/placeAdapter';
import { ADMIN_FIELD_DEFINITIONS, buildAdminCreatePlan, buildAdminEditPlan, buildPublicationTransition, classifyPublicationTarget, runPublicationChunks } from '../src/lib/adminPlaceEditor';
import { deriveSearchFields } from '../src/lib/searchDerivation';
import { objectValue } from '../src/lib/effectivePlace';

export const minimalDrafts = { name: '새 장소', regionArea: 'WEST', serviceCategory: 'CAFE' };
export const fullDrafts = Object.fromEntries(ADMIN_FIELD_DEFINITIONS.map((field) => [field.id,
  field.kind === 'triState' ? 'TRUE' : field.kind === 'category' ? 'CAFE' : field.kind === 'region' ? 'WEST'
    : field.kind === 'number' ? field.key === 'latitude' ? '33.4' : field.key === 'longitude' ? '126.4' : '0'
      : field.key === 'instagramUrl' ? 'https://instagram.com/example' : field.kind === 'url' ? 'https://example.test/image.jpg'
        : field.key === 'phone' ? '064-123-4567' : `입력 ${field.label}`]));

test('identities accept only KTO digits or lowercase UUID v4 and reject noncanonical sources', async () => {
  const identity = ownerPlaceIdentity();
  assert.ok(isPlaceId(identity.placeId)); assert.ok(isPlaceId('kto-123'));
  for (const id of ['owner-x', 'kto-x', '../kto-1', identity.placeId.toUpperCase(), identity.placeId.replace(/-4([0-9a-f]{3}-[89ab])/, '-5$1')]) assert.equal(isPlaceId(id), false);
  const plan = await buildAdminCreatePlan(minimalDrafts, identity.uuid);
  assert.ok(isCanonicalPlaceSource(plan.place, plan.source));
  assert.equal(isCanonicalPlaceSource(plan.place, { ...plan.source, path: 'misc/sources/x' }), false);
  assert.equal(isCanonicalPlaceSource(plan.place, { ...plan.source, data: { ...plan.source.data, uid: 'forbidden' } }), false);
});

test('minimal/full owner input uses real defaults, no private audit identity, exact Python parity', async () => {
  for (const drafts of [minimalDrafts, fullDrafts]) {
    const plan = await buildAdminCreatePlan(drafts, ownerPlaceIdentity().uuid);
    const ts = await deriveSearchFields(plan.place.data, plan.source.data);
    const hasPython = existsSync(new URL('../tools/firestore_place_search_fields/derive.py', import.meta.url));
    if (hasPython) {
      const py = spawnSync('python', ['-X', 'utf8', '-c', 'import json,sys;from tools.firestore_place_search_fields.derive import derive_search;x=json.load(sys.stdin);print(json.dumps(derive_search(x["place"],x["source"]),ensure_ascii=False))'],
        { encoding: 'utf8', input: JSON.stringify({ place: plan.place.data, source: plan.source.data }) });
      assert.equal(py.status, 0, py.stderr); assert.deepEqual(ts, JSON.parse(py.stdout));
    }
    const place = adaptPlace(plan.place, [plan.source]);
    assert.equal(place.category, 'cafe'); assert.equal(place.region, 'west');
    assert.equal(place.petInformationStatus, drafts === minimalDrafts ? 'UNKNOWN' : 'ADMIN_CONFIRMED');
    assert.equal(place.coordinates === null, drafts === minimalDrafts);
    assert.equal(plan.source.data.verificationStatus, 'UNVERIFIED');
    assert.equal(plan.source.data.verifiedAt, null);
    assert.equal(Object.keys(plan.source.data).length, 10);
    assert.doesNotMatch(JSON.stringify(plan), /"(?:uid|createdBy|updatedBy|email|collector|kto)":/);
    const stateOnly = { ...plan.place.data, publicationStatus: 'HIDDEN' };
    assert.deepEqual(await deriveSearchFields(stateOnly, plan.source.data), ts);
    assert.deepEqual(adaptPlaceDocs([{ ...plan.place, data: stateOnly }]), []);
    assert.deepEqual(adaptPlaceDocs([{ ...plan.place, data: { ...plan.place.data, publicationStatus: null } }]), []);
    await assert.rejects(deriveSearchFields(plan.place.data, { ...plan.source.data, collector: { hasPetJoin: 'N' } }), /source mismatch/);
    await assert.rejects(deriveSearchFields({ ...plan.place.data, petPolicy: { petInformationStatus: 'KTO_OVERLAY_FOUND' } }, plan.source.data), /source mismatch/);
  }
});

test('create validates required, paired coordinates, URLs and preserves zero/false', async () => {
  for (const drafts of [{}, { ...minimalDrafts, latitude: '33.4' }, { ...minimalDrafts, primaryImageUrl: 'javascript:alert(1)' }]) {
    await assert.rejects(buildAdminCreatePlan(drafts, ownerPlaceIdentity().uuid));
  }
  const plan = await buildAdminCreatePlan({ ...minimalDrafts, 'petPolicy.petFee': '0', 'petPolicy.indoorAllowed': 'FALSE' }, ownerPlaceIdentity().uuid);
  assert.equal(objectValue(plan.place.data.petPolicy).petFee, 0);
  assert.equal(objectValue(plan.place.data.petPolicy).indoorAllowed, 'FALSE');
});

test('both states round-trip; hidden edits preserve previous state and search is immutable on transitions', async () => {
  const plan = await buildAdminCreatePlan(fullDrafts, ownerPlaceIdentity().uuid);
  for (const status of ['DRAFT', 'PUBLISHED']) {
    const original = { ...plan.place.data, publicationStatus: status, updatedAt: 'v1' };
    const hide = buildPublicationTransition(original, 'hide', 'v2');
    assert.deepEqual(Object.keys(hide).sort(), ['manualAdmin', 'publicationStatus', 'updatedAt']);
    const hidden = { ...original, ...hide };
    const edit = buildAdminEditPlan({ place: { ...plan.place, data: hidden }, source: plan.source }, ['name'], { name: '수정 이름' }, [], 'admin');
    assert.equal(objectValue(edit.patch.manualAdmin).previousPublicationStatus, status);
    assert.ok((objectValue(edit.patch.manualAdmin).managedFields as string[]).includes('publicationStatus'));
    const restore = buildPublicationTransition(edit.nextPlace, 'restore', 'v3');
    assert.equal(restore.publicationStatus, status);
    assert.equal('previousPublicationStatus' in objectValue(restore.manualAdmin), false);
    assert.throws(() => buildPublicationTransition(hidden, 'hide', 'v3'));
    assert.throws(() => buildPublicationTransition({ publicationStatus: 'HIDDEN' }, 'restore', 'v3'));
    assert.equal(classifyPublicationTarget({ ...plan.place, data: original }, { ...plan.place, data: hidden }, 'hide'), 'already');
    assert.equal(classifyPublicationTarget(plan.place, { ...plan.place, data: { ...plan.place.data, updatedAt: 'different' } }, 'hide'), 'conflict');
  }
});

test('bulk handles 0/1/5/6/13/101/501 items in sequential five-place chunks', async () => {
  for (const count of [0, 1, 5, 6, 13, 101, 501]) {
    const places = Array.from({ length: count }, (_, i) => ({ id: `kto-${i}`, path: `places/kto-${i}`, data: { name: `Place ${i}` } }));
    const chunks: number[] = [];
    const results = await runPublicationChunks(places, 'hide', { read: async () => null, commit: async (chunk) => {
      chunks.push(chunk.length); return chunk.map((p) => ({ id: p.id, name: String(p.data.name), kind: 'committed' }));
    } });
    assert.equal(results.length, count); assert.equal(chunks.length, Math.ceil(count / 5)); assert.ok(chunks.every((n) => n <= 5));
  }
});

test('partial success, uncertain commits, denied access and cancellation account for every selected ID', async () => {
  const places = Array.from({ length: 13 }, (_, i) => ({ id: `kto-${i}`, path: `places/kto-${i}`, data: { name: `P${i}` } }));
  for (const code of ['permission-denied', 'unavailable']) {
    let calls = 0;
    const results = await runPublicationChunks(places, 'hide', {
      commit: async (chunk) => { if (calls++) throw Object.assign(new Error(code), { code }); return chunk.map((p) => ({ id: p.id, name: '', kind: 'committed' })); },
      read: async (id) => { if (id === 'kto-5') return { ...places[5], data: { publicationStatus: 'HIDDEN' } }; throw new Error('offline'); },
    });
    assert.equal(results.length, 13); assert.equal(calls, 2);
    assert.equal(results.filter((r) => r.kind === 'committed').length, 5);
    assert.equal(results.filter((r) => r.kind === 'unattempted').length, 3);
    assert.equal(results.filter((r) => r.kind === (code === 'unavailable' ? 'confirmed' : 'failed')).length, code === 'unavailable' ? 1 : 5);
  }
  const abort = new AbortController(); abort.abort();
  const results = await runPublicationChunks(places, 'hide', { read: async () => null, commit: async () => { throw new Error('must not run'); } }, { signal: abort.signal });
  assert.ok(results.every((r) => r.kind === 'unattempted'));
});
