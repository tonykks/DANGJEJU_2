export interface FavoritesService {
  listFavorites: (uid: string) => Promise<string[]>;
  addFavorite: (uid: string, placeId: string) => Promise<void>;
  removeFavorite: (uid: string, placeId: string) => Promise<void>;
}

interface FavoritesSnapshot {
  uid: string | null;
  ids: string[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  pendingIds: string[];
  error: string | null;
}

// Every account transition gets a new generation, including A -> B -> A.
// Results from an earlier generation must never update the current account.
export function createFavoritesSession(service: FavoritesService) {
  let generation = 0;
  let snapshot: FavoritesSnapshot = { uid: null, ids: [], status: 'idle', pendingIds: [], error: null };
  const listeners = new Set<() => void>();

  function publish(next: FavoritesSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  async function setUser(uid: string | null) {
    const currentGeneration = ++generation;
    publish({ uid, ids: [], status: uid ? 'loading' : 'idle', pendingIds: [], error: null });
    if (!uid) return;

    try {
      const ids = await service.listFavorites(uid);
      if (generation === currentGeneration) {
        publish({ ...snapshot, ids: [...new Set(ids)], status: 'ready' });
      }
    } catch {
      if (generation === currentGeneration) {
        publish({ ...snapshot, status: 'error', error: '찜 목록을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.' });
      }
    }
  }

  async function toggle(placeId: string) {
    const { uid, status, ids, pendingIds } = snapshot;
    if (!uid || status !== 'ready' || pendingIds.includes(placeId)) return;
    const currentGeneration = generation;
    const wasSaved = ids.includes(placeId);
    publish({ ...snapshot, pendingIds: [...pendingIds, placeId], error: null });

    try {
      await (wasSaved ? service.removeFavorite(uid, placeId) : service.addFavorite(uid, placeId));
      if (generation === currentGeneration) {
        // Update hearts only after Firestore acknowledges the write.
        publish({
          ...snapshot,
          ids: wasSaved ? snapshot.ids.filter((id) => id !== placeId) : [...new Set([...snapshot.ids, placeId])],
        });
      }
    } catch {
      if (generation === currentGeneration) {
        publish({ ...snapshot, error: '찜 변경을 확인하지 못했습니다. 연결을 확인한 뒤 찜 목록을 새로 불러와 주세요.' });
      }
    } finally {
      if (generation === currentGeneration) {
        publish({ ...snapshot, pendingIds: snapshot.pendingIds.filter((id) => id !== placeId) });
      }
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setUser,
    toggle,
    refresh: () => snapshot.pendingIds.length === 0 ? setUser(snapshot.uid) : Promise.resolve(),
  };
}
