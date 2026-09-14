import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFavoritesSession, type FavoritesService } from '../src/lib/favoritesSession.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function createService(): FavoritesService {
  const accounts = new Map<string, Set<string>>();
  const account = (uid: string) => {
    if (!accounts.has(uid)) accounts.set(uid, new Set());
    return accounts.get(uid)!;
  };
  return {
    listFavorites: async (uid) => [...account(uid)],
    addFavorite: async (uid, id) => { account(uid).add(id); },
    removeFavorite: async (uid, id) => { account(uid).delete(id); },
  };
}

test('A saves X/Y, B starts empty and saves Z, A restores only X/Y', async () => {
  const session = createFavoritesSession(createService());
  await session.setUser('A');
  await session.toggle('X');
  await session.toggle('Y');
  await session.setUser(null);
  assert.deepEqual(session.getSnapshot().ids, []);
  await session.setUser('B');
  assert.deepEqual(session.getSnapshot().ids, []);
  await session.toggle('Z');
  await session.setUser(null);
  await session.setUser('A');
  assert.deepEqual(session.getSnapshot().ids, ['X', 'Y']);
  await session.toggle('X');
  await session.setUser('A');
  assert.deepEqual(session.getSnapshot().ids, ['Y']);
  await session.setUser('B');
  assert.deepEqual(session.getSnapshot().ids, ['Z']);
});

test('guest clicks and clicks during initial load never write', async () => {
  const read = deferred<string[]>();
  let writes = 0;
  const session = createFavoritesSession({ ...createService(), listFavorites: () => read.promise, addFavorite: async () => { writes++; } });
  await session.toggle('X');
  const loading = session.setUser('A');
  await session.toggle('X');
  assert.equal(writes, 0);
  assert.deepEqual(session.getSnapshot().ids, []);
  read.resolve(['Y']);
  await loading;
  assert.deepEqual(session.getSnapshot().ids, ['Y']);
});

test('late A load cannot populate B or a logged-out session', async () => {
  for (const nextUid of ['B', null]) {
    const read = deferred<string[]>();
    const session = createFavoritesSession({ ...createService(), listFavorites: (uid) => uid === 'A' ? read.promise : Promise.resolve(['Z']) });
    const loading = session.setUser('A');
    await session.setUser(nextUid);
    read.resolve(['X', 'Y']);
    await loading;
    assert.equal(session.getSnapshot().uid, nextUid);
    assert.deepEqual(session.getSnapshot().ids, nextUid ? ['Z'] : []);
  }
});

test('late earlier A load cannot overwrite a new A login', async () => {
  const read = deferred<string[]>();
  let calls = 0;
  const session = createFavoritesSession({ ...createService(), listFavorites: () => ++calls === 1 ? read.promise : Promise.resolve(['NEW']) });
  const oldLoad = session.setUser('A');
  await session.setUser(null);
  await session.setUser('A');
  read.resolve(['OLD']);
  await oldLoad;
  assert.deepEqual(session.getSnapshot().ids, ['NEW']);
});

test('account switch clears visible favorites synchronously while the next account loads', async () => {
  const read = deferred<string[]>();
  const session = createFavoritesSession({ ...createService(), listFavorites: (uid) => uid === 'A' ? Promise.resolve(['X']) : read.promise });
  await session.setUser('A');
  const loading = session.setUser('B');
  assert.equal(session.getSnapshot().uid, 'B');
  assert.equal(session.getSnapshot().status, 'loading');
  assert.deepEqual(session.getSnapshot().ids, []);
  read.resolve(['Z']);
  await loading;
  assert.deepEqual(session.getSnapshot().ids, ['Z']);
});

test('duplicate clicks issue one write and hearts wait for server acknowledgement', async () => {
  const write = deferred<void>();
  let writes = 0;
  const session = createFavoritesSession({ ...createService(), addFavorite: () => { writes++; return write.promise; } });
  await session.setUser('A');
  const saving = session.toggle('X');
  await session.toggle('X');
  assert.equal(writes, 1);
  assert.deepEqual(session.getSnapshot().ids, []);
  assert.deepEqual(session.getSnapshot().pendingIds, ['X']);
  write.resolve();
  await saving;
  assert.deepEqual(session.getSnapshot().ids, ['X']);
  assert.deepEqual(session.getSnapshot().pendingIds, []);
});

test('late write success or failure from A does not affect B', async () => {
  for (const fail of [false, true]) {
    const write = deferred<void>();
    const session = createFavoritesSession({ ...createService(), addFavorite: () => write.promise });
    await session.setUser('A');
    const saving = session.toggle('X');
    await session.setUser('B');
    fail ? write.reject(new Error('permission-denied')) : write.resolve();
    await saving;
    assert.equal(session.getSnapshot().uid, 'B');
    assert.deepEqual(session.getSnapshot().ids, []);
    assert.deepEqual(session.getSnapshot().pendingIds, []);
    assert.equal(session.getSnapshot().error, null);
  }
});

test('failed writes retain confirmed hearts and expose a retryable error', async () => {
  const service = createService();
  await service.addFavorite('A', 'Y');
  const failure = async () => { throw new Error('permission-denied'); };
  const session = createFavoritesSession({ ...service, addFavorite: failure, removeFavorite: failure });
  await session.setUser('A');
  await session.toggle('X');
  assert.deepEqual(session.getSnapshot().ids, ['Y']);
  assert.ok(session.getSnapshot().error);
  await session.toggle('Y');
  assert.deepEqual(session.getSnapshot().ids, ['Y']);
  assert.deepEqual(session.getSnapshot().pendingIds, []);
  await session.refresh();
  assert.deepEqual(session.getSnapshot().ids, ['Y']);
  assert.equal(session.getSnapshot().error, null);
});

test('failed load blocks writes, clears previous account and can be retried', async () => {
  let fail = true;
  let writes = 0;
  const session = createFavoritesSession({
    ...createService(),
    listFavorites: async () => { if (fail) throw new Error('offline'); return ['X']; },
    addFavorite: async () => { writes++; },
  });
  await session.setUser('A');
  assert.equal(session.getSnapshot().status, 'error');
  assert.deepEqual(session.getSnapshot().ids, []);
  await session.toggle('Y');
  assert.equal(writes, 0);
  fail = false;
  await session.refresh();
  assert.equal(session.getSnapshot().status, 'ready');
  assert.deepEqual(session.getSnapshot().ids, ['X']);
  assert.equal(session.getSnapshot().error, null);
});

test('parallel writes to different places preserve both results; refresh waits', async () => {
  const x = deferred<void>();
  const y = deferred<void>();
  const session = createFavoritesSession({ ...createService(), addFavorite: (_uid, id) => id === 'X' ? x.promise : y.promise });
  await session.setUser('A');
  const savingX = session.toggle('X');
  const savingY = session.toggle('Y');
  await session.refresh();
  assert.equal(session.getSnapshot().status, 'ready');
  y.resolve();
  await savingY;
  x.resolve();
  await savingX;
  assert.deepEqual([...session.getSnapshot().ids].sort(), ['X', 'Y']);
  assert.deepEqual(session.getSnapshot().pendingIds, []);
});
