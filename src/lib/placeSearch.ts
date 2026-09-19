import {
  collection, doc, getDoc, getDocs, limit, orderBy, query, where,
  type Firestore, type QueryDocumentSnapshot,
} from 'firebase/firestore/lite';
import type { CatalogDocument } from './placeAdapter';
import {
  HERO_LIMIT, HERO_TOTAL_SCORE_MIN, SEARCH_VERSION,
  type PlaceSearchFields, type SearchCategory, type SearchRegion,
} from './searchTypes';
import { isQuotaError, assertNotInQuotaCooldown, markQuotaFailure } from './firestoreQuota';

function documentData(snapshot: QueryDocumentSnapshot): CatalogDocument {
  return { id: snapshot.id, path: snapshot.ref.path, data: snapshot.data() as Record<string, unknown> };
}

export function readSearchFields(data: Record<string, unknown>): PlaceSearchFields | null {
  const search = data.search;
  if (!search || typeof search !== 'object' || Array.isArray(search)) return null;
  const s = search as Record<string, unknown>;
  if (s.version !== SEARCH_VERSION) return null;
  if (typeof s.region !== 'string' || typeof s.category !== 'string') return null;
  if (typeof s.petSortKey !== 'number' || typeof s.totalScore !== 'number') return null;
  if (typeof s.primarySourceId !== 'string' || !s.primarySourceId || s.primarySourceId.includes('/')) return null;
  return s as unknown as PlaceSearchFields;
}

export async function guardedFirestoreRead<T>(work: () => Promise<T>): Promise<T> {
  assertNotInQuotaCooldown();
  try {
    return await work();
  } catch (error) {
    if (isQuotaError(error)) markQuotaFailure();
    throw error;
  }
}

/** Home hero: totalScore >= 12, top HERO_LIMIT. No Source reads. */
export function loadHeroPlaces(db: Firestore): Promise<CatalogDocument[]> {
  return guardedFirestoreRead(async () => {
    const snapshot = await getDocs(query(
      collection(db, 'places'),
      where('search.version', '==', SEARCH_VERSION),
      where('search.totalScore', '>=', HERO_TOTAL_SCORE_MIN),
      orderBy('search.totalScore', 'desc'),
      limit(HERO_LIMIT),
    ));
    return snapshot.docs.map(documentData);
  });
}

/** Condition search: full result set, petSortKey desc. No Source reads. */
export function searchPlaces(
  db: Firestore,
  region: SearchRegion,
  category: SearchCategory,
): Promise<CatalogDocument[]> {
  if (region === 'UNKNOWN' || category === 'UNKNOWN') {
    return Promise.reject(new Error('Invalid search filters'));
  }
  return guardedFirestoreRead(async () => {
    const snapshot = await getDocs(query(
      collection(db, 'places'),
      where('search.version', '==', SEARCH_VERSION),
      where('search.region', '==', region),
      where('search.category', '==', category),
      orderBy('search.petSortKey', 'desc'),
    ));
    return snapshot.docs.map(documentData);
  });
}

export function getPlace(db: Firestore, placeId: string): Promise<CatalogDocument | null> {
  if (!placeId || placeId.includes('/')) return Promise.reject(new Error('Invalid place ID'));
  return guardedFirestoreRead(async () => {
    const snapshot = await getDoc(doc(db, 'places', placeId));
    return snapshot.exists() ? documentData(snapshot as QueryDocumentSnapshot) : null;
  });
}

export function getPlaceSource(
  db: Firestore,
  placeId: string,
  sourceId: string,
): Promise<CatalogDocument | null> {
  if (!placeId || !sourceId || placeId.includes('/') || sourceId.includes('/')) {
    return Promise.reject(new Error('Invalid place/source ID'));
  }
  return guardedFirestoreRead(async () => {
    const snapshot = await getDoc(doc(db, 'places', placeId, 'sources', sourceId));
    return snapshot.exists() ? documentData(snapshot as QueryDocumentSnapshot) : null;
  });
}

/** Resolve favorite place IDs without loading the full catalog. */
export async function loadPlacesByIds(db: Firestore, placeIds: string[]): Promise<CatalogDocument[]> {
  const unique = [...new Set(placeIds.filter((id) => id && !id.includes('/') && /^kto-\d+$/.test(id)))];
  const results: CatalogDocument[] = [];
  const concurrency = 4;
  for (let i = 0; i < unique.length; i += concurrency) {
    const chunk = unique.slice(i, i + concurrency);
    const docs = await Promise.all(chunk.map((id) => getPlace(db, id)));
    for (const docEntry of docs) if (docEntry) results.push(docEntry);
  }
  return results;
}
