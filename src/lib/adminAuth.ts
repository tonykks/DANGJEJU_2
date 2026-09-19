import { doc, getDoc, type Firestore } from 'firebase/firestore/lite';

export type AdminAccessStatus = 'signed-out' | 'loading' | 'active' | 'denied' | 'error';

export type AdminAccessSnapshot = {
  uid: string | null;
  status: AdminAccessStatus;
  active: boolean;
};

export function isActiveAdminRecord(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.role === 'admin' && record.active === true;
}

export async function readAdminStatus(db: Firestore, uid: string): Promise<boolean> {
  if (!uid || uid.includes('/')) return false;
  const snapshot = await getDoc(doc(db, 'admins', uid));
  return snapshot.exists() && isActiveAdminRecord(snapshot.data());
}

export function createAdminAccessSession(read: (uid: string) => Promise<boolean>) {
  let revision = 0;
  let snapshot: AdminAccessSnapshot = { uid: null, status: 'signed-out', active: false };
  const listeners = new Set<() => void>();
  const publish = (next: AdminAccessSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  async function setUser(uid: string | null) {
    const request = ++revision;
    if (!uid) {
      publish({ uid: null, status: 'signed-out', active: false });
      return;
    }
    publish({ uid, status: 'loading', active: false });
    try {
      const active = await read(uid);
      if (request !== revision || snapshot.uid !== uid) return;
      publish({ uid, status: active ? 'active' : 'denied', active });
    } catch {
      if (request !== revision || snapshot.uid !== uid) return;
      publish({ uid, status: 'error', active: false });
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setUser,
  };
}
