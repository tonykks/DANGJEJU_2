import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdminAccessSession, isActiveAdminRecord } from '../src/lib/adminAuth.ts';
import { ADMIN_PLACES_HASH, adminHashUrl, homeHashUrl, routeFromHash } from '../src/lib/hashRoute.ts';

test('admin status is default-deny and requires the exact active role contract', () => {
  assert.equal(isActiveAdminRecord({ role: 'admin', active: true }), true);
  for (const value of [null, {}, { role: 'admin' }, { role: 'admin', active: false }, { role: 'owner', active: true }, { role: 'admin', active: 1 }]) {
    assert.equal(isActiveAdminRecord(value), false);
  }
});

test('admin session rejects stale UID, logout, and failed-read results', async () => {
  const pending = new Map<string, (value: boolean) => void>();
  const session = createAdminAccessSession((uid) => new Promise<boolean>((resolve, reject) => {
    pending.set(uid, uid === 'error' ? () => reject(new Error('denied')) : resolve);
  }));
  const old = session.setUser('old');
  const current = session.setUser('current');
  pending.get('old')!(true);
  await old;
  assert.deepEqual(session.getSnapshot(), { uid: 'current', status: 'loading', active: false });
  pending.get('current')!(true);
  await current;
  assert.equal(session.getSnapshot().active, true);

  const loggedOut = session.setUser('late');
  await session.setUser(null);
  pending.get('late')!(true);
  await loggedOut;
  assert.deepEqual(session.getSnapshot(), { uid: null, status: 'signed-out', active: false });

  const failed = session.setUser('error');
  pending.get('error')!(false);
  await failed;
  assert.deepEqual(session.getSnapshot(), { uid: 'error', status: 'error', active: false });
});

test('hash routing is dependency-free and base-path safe for Firebase root and Pages', () => {
  assert.equal(routeFromHash(ADMIN_PLACES_HASH), 'admin-places');
  assert.equal(routeFromHash('#/admin/places/'), 'admin-places');
  assert.equal(routeFromHash('#/anything-else'), 'home');
  assert.equal(adminHashUrl('/', ''), '/#/admin/places');
  assert.equal(adminHashUrl('/DANGJEJU_2/', '?preview=1'), '/DANGJEJU_2/?preview=1#/admin/places');
  assert.equal(homeHashUrl('/DANGJEJU_2/'), '/DANGJEJU_2/#/');
});
