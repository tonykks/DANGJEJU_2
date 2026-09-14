import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import { collection, collectionGroup, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, query, serverTimestamp, setDoc, where } from 'firebase/firestore/lite';

const emulator = process.env.FIRESTORE_EMULATOR_HOST;

// Start an emulator with this repository's firestore.rules before running.
// Seed/write tests are strictly confined to a local emulator and demo project.
test('rules keep catalog read-only and favorites owner-only; source-only query is a release blocker', {
  skip: !emulator ? 'Requires a local Firestore emulator; never run against production.' : false,
}, async () => {
  assert.match(emulator!, /^127\.0\.0\.1:[0-9]+$/);
  const port = Number(emulator!.split(':')[1]);
  assert.ok(port > 0 && port <= 65535);
  const project = 'demo-hank-incident-rules';
  const base = `http://${emulator}/v1/projects/${project}/databases/(default)/documents`;
  const apps = ['guest', 'alice', 'bob'].map((name) => initializeApp({ projectId: project }, `${project}-${name}`));
  const [guest, alice, bob] = apps.map((app, index) => {
    const db = getFirestore(app);
    connectFirestoreEmulator(db, '127.0.0.1', port, index ? { mockUserToken: { sub: index === 1 ? 'alice' : 'bob' } } : undefined);
    return db;
  });
  const denied = (request: Promise<unknown>) => assert.rejects(request, { code: 'permission-denied' });
  const seed = async (path: string, values: Record<string, string>) => {
    const response = await fetch(`${base}/${path}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { stringValue: value }])) }) });
    assert.equal(response.status, 200, await response.text());
  };
  try {
    await seed('places/kto-1', { placeId: 'kto-1' });
    await seed('places/kto-1/sources/canonical', { source: 'KTO', placeId: 'kto-1' });
    await seed('places/kto-2/sources/nested-public', { source: 'OTHER', placeId: 'kto-2' });
    await seed('misc/rules/sources/valid-kto', { source: 'KTO', placeId: 'kto-2' });
    await seed('misc/rules/sources/private', { source: 'OTHER', placeId: 'kto-3' });
    await seed('misc/rules/sources/invalid', { source: 'KTO', placeId: 'unrelated' });
    await seed('misc/rules/sources/missing', { source: 'KTO' });
    assert.equal((await getDocs(collection(guest, 'places'))).empty, false);
    assert.equal((await getDoc(doc(guest, 'places/kto-2/sources/nested-public'))).exists(), true);
    await denied(setDoc(doc(alice, 'places/kto-1'), { placeId: 'kto-1' }));
    await denied(setDoc(doc(alice, 'places/kto-1/sources/canonical'), { source: 'KTO', placeId: 'kto-1' }));
    await denied(deleteDoc(doc(alice, 'misc/rules/sources/valid-kto')));
    await denied(getDocs(collectionGroup(guest, 'sources')));
    // This is intentionally denied: a source equality does not prove placeId's regex.
    await denied(getDocs(query(collectionGroup(guest, 'sources'), where('source', '==', 'KTO'))));
    const constrained = await getDocs(query(collectionGroup(guest, 'sources'), where('source', '==', 'KTO'), where('placeId', 'in', ['kto-1', 'kto-2'])));
    assert.equal(constrained.size, 2);
    await denied(getDocs(query(collectionGroup(guest, 'sources'), where('source', '==', 'KTO'), where('placeId', 'in', ['kto-1', 'invalid']))));
    for (const id of ['private', 'invalid', 'missing']) await denied(getDoc(doc(guest, `misc/rules/sources/${id}`)));
    await denied(getDoc(doc(guest, 'unimplemented/document')));
    await denied(getDocs(collection(guest, 'users/alice/favorites')));
    await setDoc(doc(alice, 'users/alice/favorites/kto-1'), { placeId: 'kto-1', createdAt: serverTimestamp() });
    assert.equal((await getDocs(collection(alice, 'users/alice/favorites'))).size, 1);
    await denied(getDocs(collection(bob, 'users/alice/favorites')));
    await denied(setDoc(doc(bob, 'users/alice/favorites/kto-1'), { placeId: 'kto-1', createdAt: serverTimestamp() }));
    await denied(setDoc(doc(alice, 'users/alice/favorites/kto-2'), { placeId: 'wrong', createdAt: serverTimestamp() }));
    await denied(setDoc(doc(alice, 'users/alice/favorites/kto-2'), { placeId: 'kto-2', createdAt: serverTimestamp(), extra: true }));
    await denied(setDoc(doc(alice, 'users/alice/favorites/kto-2'), { placeId: 'kto-2', createdAt: 'not-a-timestamp' }));
    await denied(deleteDoc(doc(bob, 'users/alice/favorites/kto-1')));
    await deleteDoc(doc(alice, 'users/alice/favorites/kto-1'));
  } finally { await Promise.all(apps.map(deleteApp)); }
});
