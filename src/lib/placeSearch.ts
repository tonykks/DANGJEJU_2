import {
  collection, doc, documentId, getDoc, getDocs, limit, orderBy, query, where,
  type Firestore, type QueryDocumentSnapshot,
} from 'firebase/firestore/lite';
import type { CatalogDocument } from './placeAdapter';
import { isPlaceId, PUBLICATION_VISIBLE_STATUSES } from './placeIdentity';
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
      where('publicationStatus', 'in', [...PUBLICATION_VISIBLE_STATUSES]),
      where('search.version', '==', SEARCH_VERSION),
      where('search.totalScore', '>=', HERO_TOTAL_SCORE_MIN),
      orderBy('search.totalScore', 'desc'),
      orderBy(documentId(), 'desc'),
      limit(HERO_LIMIT),
    ));
    return snapshot.docs.map(documentData);
  });
}

/** Condition search: full result set, petSortKey desc. No Source reads. */
export function searchPlaces(
  db: Firestore,
  region: SearchRegion,
  category?: SearchCategory,
): Promise<CatalogDocument[]> {
  if (region === 'UNKNOWN' || category === 'UNKNOWN') {
    return Promise.reject(new Error('Invalid search filters'));
  }
  return guardedFirestoreRead(async () => {
    if (category) {
      const snapshot = await getDocs(query(
        collection(db, 'places'),
        where('publicationStatus', 'in', [...PUBLICATION_VISIBLE_STATUSES]),
        where('search.version', '==', SEARCH_VERSION),
        where('search.region', '==', region),
        where('search.category', '==', category),
        orderBy('search.petSortKey', 'desc'),
        orderBy(documentId(), 'desc'),
      ));
      return snapshot.docs.map(documentData);
    }

    // Region-only search reuses the already deployed
    // version + region + category + petSortKey composite index.
    // Query each known category, then merge the results client-side.
    const categories: SearchCategory[] = [
      'ATTRACTION',
      'CAFE',
      'FOOD',
      'SHOPPING',
      'STAY',
      'LEISURE',
      'CULTURE',
      'EVENT',
    ];
    const snapshots = await Promise.all(categories.map((searchCategory) => getDocs(query(
      collection(db, 'places'),
      where('publicationStatus', 'in', [...PUBLICATION_VISIBLE_STATUSES]),
      where('search.version', '==', SEARCH_VERSION),
      where('search.region', '==', region),
      where('search.category', '==', searchCategory),
      orderBy('search.petSortKey', 'desc'),
      orderBy(documentId(), 'desc'),
    ))));

    return snapshots
      .flatMap((snapshot) => snapshot.docs.map(documentData))
      .sort((a, b) => {
        const aSearch = readSearchFields(a.data);
        const bSearch = readSearchFields(b.data);
        return (bSearch?.petSortKey ?? 0) - (aSearch?.petSortKey ?? 0);
      });
  });
}

export function getAdminPlace(db: Firestore, placeId: string): Promise<CatalogDocument | null> {
  if (!isPlaceId(placeId)) return Promise.reject(new Error('Invalid place ID'));
  return guardedFirestoreRead(async () => {
    const snapshot = await getDoc(doc(db, 'places', placeId));
    return snapshot.exists() ? documentData(snapshot as QueryDocumentSnapshot) : null;
  });
}

export function getPublicPlace(db: Firestore, placeId: string): Promise<CatalogDocument | null> {
  if (!isPlaceId(placeId)) return Promise.reject(new Error('Invalid place ID'));
  return guardedFirestoreRead(async () => {
    // A document-name equality can authorize against the actual hidden document
    // before filtering. The immutable placeId field keeps this a filtered query.
    const snapshot = await getDocs(query(collection(db, 'places'),
      where('placeId', '==', placeId), where('publicationStatus', 'in', [...PUBLICATION_VISIBLE_STATUSES]), limit(1)));
    return snapshot.empty ? null : documentData(snapshot.docs[0]);
  });
}

/** All non-admin call sites must revalidate public visibility. */
export const getPlace = getPublicPlace;

export function getPlaceSource(
  db: Firestore,
  placeId: string,
  sourceId: string,
): Promise<CatalogDocument | null> {
  if (!isPlaceId(placeId) || !sourceId || sourceId.includes('/')) {
    return Promise.reject(new Error('Invalid place/source ID'));
  }
  return guardedFirestoreRead(async () => {
    const snapshot = await getDoc(doc(db, 'places', placeId, 'sources', sourceId));
    return snapshot.exists() ? documentData(snapshot as QueryDocumentSnapshot) : null;
  });
}

/** Resolve favorite place IDs without loading the full catalog. */
export async function loadPlacesByIds(db: Firestore, placeIds: string[]): Promise<CatalogDocument[]> {
  const unique = [...new Set(placeIds.filter(isPlaceId))];
  const results = new Map<string, CatalogDocument>();
  for (let i = 0; i < unique.length; i += 10) {
    const snapshot = await guardedFirestoreRead(() => getDocs(query(collection(db, 'places'),
      where('placeId', 'in', unique.slice(i, i + 10)),
      where('publicationStatus', 'in', [...PUBLICATION_VISIBLE_STATUSES]))));
    for (const entry of snapshot.docs) results.set(entry.id, documentData(entry));
  }
  return unique.flatMap((id) => results.has(id) ? [results.get(id)!] : []);
}
