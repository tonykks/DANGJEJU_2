import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import { collection, collectionGroup, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore/lite';
import {
  ADMIN_FIELD_DEFINITIONS, batchHideAdminPlaces, batchRestoreAdminPlaces, buildAdminCreatePlan, buildAdminEditPlan,
  buildPublicationTransition, createAdminPlace, loadAdminPlace, saveAdminPlace, searchAdminPlacesByName, searchAdminPlacesByRegionAndCategory,
} from '../src/lib/adminPlaceEditor';
import { getPublicPlace, getPlaceSource, loadHeroPlaces, loadPlacesByIds, searchPlaces } from '../src/lib/placeSearch';
import { objectValue } from '../src/lib/effectivePlace';
import { UI_CATEGORY_TO_SEARCH, UI_REGION_TO_SEARCH } from '../src/lib/searchTypes';

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const minDraft = { name: '신규 테스트', serviceCategory: 'CAFE', regionArea: 'WEST' };
const maxDraft = Object.fromEntries(ADMIN_FIELD_DEFINITIONS.map((f) => [f.id,
  f.kind === 'triState' ? 'TRUE' : f.kind === 'region' ? 'WEST' : f.kind === 'category' ? 'CAFE'
    : f.key === 'latitude' ? '33.4' : f.key === 'longitude' ? '126.4' : f.kind === 'number' ? '0'
      : f.key === 'phone' ? '064-123-4567' : f.key === 'instagramUrl' ? 'https://instagram.com/test'
        : f.kind === 'url' ? 'https://example.test/test.jpg' : `최대 입력 ${f.label}`]));

function restValue(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (value instanceof Date || objectValue(value)._methodName === 'serverTimestamp') return { timestampValue: '2026-10-01T00:00:00Z' };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(restValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, restValue(entry)])) } };
}

test('CRUD rules: atomic owner creation, mixed-state bulk, hidden visibility, 32 queries and pagination', {
  skip: !emulator ? 'Requires local demo Firestore emulator.' : false,
}, async (t) => {
  assert.match(emulator!, /^127\.0\.0\.1:\d+$/);
  const project = 'demo-place-crud';
  const reset = await fetch(`http://${emulator}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(reset.status, 200);
  const base = `http://${emulator}/v1/projects/${project}/databases/(default)/documents`;
  const identities = [null, 'normal', 'inactive', 'wrong-role', 'active-admin'] as const;
  const apps = identities.map((uid) => initializeApp({ projectId: project }, `${project}-${uid}`));
  const databases = apps.map((app, index) => {
    const db = getFirestore(app); const uid = identities[index];
    connectFirestoreEmulator(db, '127.0.0.1', Number(emulator!.split(':')[1]), uid ? { mockUserToken: { sub: uid } } : undefined);
    return db;
  });
  const [guest, normal, inactive, wrongRole, admin] = databases;
  const denied = (promise: Promise<unknown>) => assert.rejects(promise, { code: 'permission-denied' });
  const seed = async (path: string, data: Record<string, unknown>) => {
    const response = await fetch(`${base}/${path}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(restValue(data).mapValue) });
    assert.equal(response.status, 200, await response.text());
  };
  const sendPair = async (db: typeof admin, plan: Awaited<ReturnType<typeof buildAdminCreatePlan>>) => {
    const batch = writeBatch(db); batch.set(doc(db, plan.place.path), plan.place.data); batch.set(doc(db, plan.source.path), plan.source.data); await batch.commit();
  };
  try {
    await seed('admins/active-admin', { role: 'admin', active: true });
    await seed('admins/inactive', { role: 'admin', active: false });
    await seed('admins/wrong-role', { role: 'user', active: true });
    const minimal = await buildAdminCreatePlan(minDraft, randomUUID());
    const full = await buildAdminCreatePlan(maxDraft, randomUUID());
    await t.test('minimum and maximum create builders commit both docs; same-ID retry confirms', async () => {
      assert.equal(await createAdminPlace(admin, minimal, 'active-admin'), 'created');
      assert.equal(await createAdminPlace(admin, minimal, 'active-admin'), 'confirmed');
      assert.equal(await createAdminPlace(admin, full, 'active-admin'), 'created');
      assert.equal((await getPublicPlace(guest, minimal.place.id))?.id, minimal.place.id);
      assert.equal((await loadAdminPlace(admin, full.place.id)).source.data.source, 'OWNER_INPUT');
      await assert.rejects(createAdminPlace(admin, await buildAdminCreatePlan({ ...minDraft, name: '충돌' }, minimal.uuid), 'active-admin'), /다른 데이터/);
    });
    await t.test('dense create remains valid when each optional input is omitted', async () => {
      for (const field of ADMIN_FIELD_DEFINITIONS.filter((f) => !['name', 'regionArea', 'serviceCategory', 'longitude'].includes(f.id))) {
        const drafts = { ...maxDraft };
        delete drafts[field.id];
        if (field.id === 'latitude') delete drafts.longitude;
        const plan = await buildAdminCreatePlan(drafts, randomUUID());
        try { assert.equal(await createAdminPlace(admin, plan, 'active-admin'), 'created'); }
        catch (error) { throw new Error(`Create failed with omitted ${field.id}`, { cause: error }); }
      }
    });
    await t.test('create denials: roles, orphan docs, KTO source, extra identity, invalid envelope, spoofed search', async () => {
      for (const db of [guest, normal, inactive, wrongRole]) await denied(sendPair(db, await buildAdminCreatePlan(minDraft, randomUUID())));
      const orphan = await buildAdminCreatePlan(minDraft, randomUUID());
      await denied(setDoc(doc(admin, orphan.place.path), orphan.place.data));
      await denied(setDoc(doc(admin, orphan.source.path), orphan.source.data));
      for (const mutate of [
        (p: typeof minimal) => { p.place.data.uid = 'forbidden'; },
        (p: typeof minimal) => { objectValue(p.place.data.manualAdmin).updatedBy = 'forbidden'; },
        (p: typeof minimal) => { p.source.data.verificationStatus = 'ADMIN_CONFIRMED'; },
        (p: typeof minimal) => { p.source.data.updatedBy = 'forbidden'; },
        (p: typeof minimal) => { p.source.data.source = 'KTO'; },
        (p: typeof minimal) => { p.source.data.placeId = full.place.id; },
        (p: typeof minimal) => { objectValue(p.place.data.search).primarySourceId = full.source.id; },
        (p: typeof minimal) => { objectValue(p.place.data.search).totalScore = 999; },
        (p: typeof minimal) => { objectValue(p.place.data.search).categoryBasis = 'KTO_CONTENT_TYPE'; },
      ]) { const plan = await buildAdminCreatePlan(minDraft, randomUUID()); mutate(plan); await denied(sendPair(admin, plan)); }
      await denied(setDoc(doc(admin, `places/${minimal.place.id}/sources/extra`), { ...minimal.source.data, placeSourceId: 'extra' }));
      await denied(updateDoc(doc(admin, minimal.source.path), { verificationStatus: 'VERIFIED' }));
      await denied(deleteDoc(doc(admin, minimal.source.path))); await denied(deleteDoc(doc(admin, minimal.place.path)));
      await denied(setDoc(doc(normal, 'admins/normal'), { role: 'admin', active: true }));
    });
    await t.test('five-doc transaction preserves mixed publication states and maximum audits', async () => {
      const ids = [minimal.place.id, full.place.id];
      for (let i = 0; i < 4; i++) {
        const id = `kto-${8000 + i}`;
        await seed(`places/${id}`, { ...full.place.data, placeId: id, publicationStatus: i % 2 ? 'PUBLISHED' : 'DRAFT', search: { ...objectValue(full.place.data.search), primarySourceId: 'canonical' } });
        await seed(`places/${id}/sources/canonical`, { source: 'KTO', placeSourceId: 'canonical', placeId: id, collector: { hasPetJoin: 'N' }, kto: { pet: null } });
        ids.push(id);
      }
      const loaded = await Promise.all(ids.map((id) => loadAdminPlace(admin, id)));
      const beforeSources = loaded.map((p) => p.source.data);
      await setDoc(doc(normal, `users/normal/favorites/${minimal.place.id}`), { placeId: minimal.place.id, createdAt: serverTimestamp() });
      for (const db of [guest, normal, inactive, wrongRole]) await denied(updateDoc(doc(db, full.place.path), buildPublicationTransition(loaded[1].place.data, 'hide', serverTimestamp())));
      await denied(updateDoc(doc(admin, full.place.path), { ...buildPublicationTransition(loaded[1].place.data, 'hide', serverTimestamp()), name: '상태와 편집 혼합' }));
      const bad = buildPublicationTransition(loaded[1].place.data, 'hide', serverTimestamp()); objectValue(bad.manualAdmin).previousPublicationStatus = 'DRAFT';
      await denied(updateDoc(doc(admin, full.place.path), bad));
      await denied(updateDoc(doc(admin, full.place.path), { publicationStatus: 'DRAFT' }));
      assert.ok((await batchHideAdminPlaces(admin, loaded.map((p) => p.place))).every((r) => r.kind === 'committed'));
      assert.ok((await batchHideAdminPlaces(admin, loaded.map((p) => p.place))).every((r) => r.kind === 'already'));
      assert.equal(await getPublicPlace(guest, minimal.place.id), null);
      assert.deepEqual(await loadPlacesByIds(guest, ids), []);
      assert.ok(!(await searchPlaces(guest, 'WEST', 'CAFE')).some((p) => ids.includes(p.id)));
      assert.ok(!(await loadHeroPlaces(guest)).some((p) => ids.includes(p.id)));
      await denied(getDoc(doc(guest, full.place.path))); await denied(getPlaceSource(guest, full.place.id, full.source.id));
      await denied(getDoc(doc(guest, 'places/kto-8000/sources/canonical')));
      await denied(getDocs(query(collectionGroup(guest, 'sources'), where('source', '==', 'KTO'), where('placeId', 'in', ['kto-8000']))));
      assert.equal((await getDocs(collection(normal, 'users/normal/favorites'))).size, 1);
      const hiddenFull = await loadAdminPlace(admin, full.place.id);
      for (const db of [guest, normal, inactive, wrongRole]) await denied(updateDoc(doc(db, full.place.path), buildPublicationTransition(hiddenFull.place.data, 'restore', serverTimestamp())));
      const edit = buildAdminEditPlan(hiddenFull, ['name'], { name: '숨김 중 편집' }, [], 'active-admin');
      await saveAdminPlace(admin, hiddenFull, edit, 'active-admin');
      const hidden = await Promise.all(ids.map((id) => loadAdminPlace(admin, id)));
      hidden.forEach((p, i) => {
        assert.equal(objectValue(p.place.data.manualAdmin).previousPublicationStatus, loaded[i].place.data.publicationStatus);
        assert.deepEqual(p.source.data, beforeSources[i]);
        if (i !== 1) assert.deepEqual(p.place.data.search, loaded[i].place.data.search);
      });
      assert.ok((await batchRestoreAdminPlaces(admin, hidden.map((p) => p.place))).every((r) => r.kind === 'committed'));
      for (let i = 0; i < ids.length; i++) {
        const restored = (await loadAdminPlace(admin, ids[i])).place;
        assert.equal(restored.data.publicationStatus, loaded[i].place.data.publicationStatus);
        assert.equal('previousPublicationStatus' in objectValue(restored.data.manualAdmin), false);
      }
      assert.equal((await loadPlacesByIds(guest, [minimal.place.id])).length, 1);
      assert.equal((await getDocs(collection(normal, 'users/normal/favorites'))).size, 1);
      const unknown = { ...hidden[0].place, data: { ...hidden[0].place.data, manualAdmin: {} } };
      await seed(unknown.path, unknown.data);
      assert.equal((await batchRestoreAdminPlaces(admin, [unknown]))[0].kind, 'unrestorable');
    });
    await t.test('32 combinations query public, normal admin and hidden admin; name and 100-item cursor', async () => {
      let nextId = 9000;
      for (const region of Object.values(UI_REGION_TO_SEARCH)) for (const category of Object.values(UI_CATEGORY_TO_SEARCH)) {
        for (const publicationStatus of ['DRAFT', 'HIDDEN']) {
          const id = `kto-${nextId++}`;
          await seed(`places/${id}`, { ...minimal.place.data, placeId: id, publicationStatus, regionArea: region, serviceCategory: category, search: { ...objectValue(minimal.place.data.search), region, category } });
        }
        assert.ok((await searchPlaces(guest, region, category)).length >= 1);
        for (const hidden of [false, true]) assert.ok((await searchAdminPlacesByRegionAndCategory(admin, { region, category, hidden })).places.length >= 1);
      }
      for (let i = 0; i < 105; i++) await seed(`places/kto-${10000 + i}`, { ...minimal.place.data, placeId: `kto-${10000 + i}`, name: '동명 페이지', publicationStatus: 'DRAFT', regionArea: 'EAST', serviceCategory: 'EVENT', search: { ...objectValue(minimal.place.data.search), region: 'EAST', category: 'EVENT' } });
      const filter = { region: 'EAST', category: 'EVENT', hidden: false } as const;
      const first = await searchAdminPlacesByRegionAndCategory(admin, filter);
      const second = await searchAdminPlacesByRegionAndCategory(admin, filter, first.cursor);
      assert.equal(first.places.length, 100); assert.ok(first.hasMore); assert.equal(second.places.length, 6); assert.equal(second.hasMore, false);
      assert.equal(new Set([...first.places, ...second.places].map((p) => p.id)).size, 106);
      assert.equal((await searchAdminPlacesByName(admin, '동명')).length, 12);
    });
    await t.test('hidden KTO all 54 fields, mixed clear, cumulative clear and restore preserve audits', async () => {
      const basePlan = await buildAdminCreatePlan({ name: '편집 전', regionArea: 'EAST', serviceCategory: 'FOOD' }, randomUUID());
      const id = 'kto-12000';
      await seed(`places/${id}`, { ...basePlan.place.data, placeId: id, publicationStatus: 'DRAFT',
        manualAdmin: { source: 'ADMIN_UI', changedFields: [], changedTopLevel: [], managedFields: [], clearedFields: [], updatedAt: new Date() },
        search: { ...objectValue(basePlan.place.data.search), primarySourceId: 'canonical' } });
      await seed(`places/${id}/sources/canonical`, { source: 'KTO', placeSourceId: 'canonical', placeId: id, collector: { hasPetJoin: 'N' }, kto: { pet: null } });
      let loaded = await loadAdminPlace(admin, id);
      assert.equal((await batchHideAdminPlaces(admin, [loaded.place]))[0].kind, 'committed');
      loaded = await loadAdminPlace(admin, id);
      const fullEdit = buildAdminEditPlan(loaded, ADMIN_FIELD_DEFINITIONS.map((f) => f.id), maxDraft, [], 'active-admin');
      assert.equal(fullEdit.changes.length, 54);
      await saveAdminPlace(admin, loaded, fullEdit, 'active-admin');
      loaded = await loadAdminPlace(admin, id);
      const mixed = Object.fromEntries(ADMIN_FIELD_DEFINITIONS.map((f) => [f.id, f.kind === 'triState' ? 'FALSE' : f.kind === 'category' ? 'FOOD' : f.kind === 'region' ? 'EAST' : '다시 변경']));
      const clears = ADMIN_FIELD_DEFINITIONS.filter((f) => f.allowClear).map((f) => f.id);
      const mixedEdit = buildAdminEditPlan(loaded, ADMIN_FIELD_DEFINITIONS.map((f) => f.id), mixed, clears, 'active-admin');
      assert.equal(mixedEdit.changes.length, 53);
      await saveAdminPlace(admin, loaded, mixedEdit, 'active-admin');
      loaded = await loadAdminPlace(admin, id);
      assert.equal(objectValue(loaded.place.data.manualAdmin).previousPublicationStatus, 'DRAFT');
      assert.equal((await batchRestoreAdminPlaces(admin, [loaded.place]))[0].kind, 'committed');
      loaded = await loadAdminPlace(admin, id);
      const fields = ['phone', 'primaryImageUrl', 'secondaryImageUrl', 'instagramUrl'];
      await saveAdminPlace(admin, loaded, buildAdminEditPlan(loaded, fields, maxDraft, [], 'active-admin'), 'active-admin');
      for (const field of fields) {
        loaded = await loadAdminPlace(admin, id);
        await saveAdminPlace(admin, loaded, buildAdminEditPlan(loaded, [field], {}, [field], 'active-admin'), 'active-admin');
      }
      loaded = await loadAdminPlace(admin, id);
      assert.equal(loaded.place.data.publicationStatus, 'DRAFT');
      assert.ok((objectValue(loaded.place.data.manualAdmin).managedFields as string[]).includes('publicationStatus'));
    });
  } finally { await Promise.all(apps.map(deleteApp)); }
});
