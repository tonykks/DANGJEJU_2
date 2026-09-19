import { useEffect, useState, useSyncExternalStore } from 'react';
import { createAdminAccessSession, readAdminStatus } from '../lib/adminAuth';
import { db } from '../lib/firebase';

export function useAdminAccess(uid: string | null) {
  const [session] = useState(() => createAdminAccessSession(async (currentUid) => {
    if (!db) throw new Error('Firestore is not configured.');
    return readAdminStatus(db, currentUid);
  }));
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);

  useEffect(() => {
    void session.setUser(uid);
    return () => { void session.setUser(null); };
  }, [session, uid]);

  const retry = () => { if (uid) void session.setUser(uid); };

  if (snapshot.uid !== uid) {
    return uid
      ? { uid, status: 'loading' as const, active: false, retry }
      : { uid: null, status: 'signed-out' as const, active: false, retry };
  }
  return { ...snapshot, retry };
}
