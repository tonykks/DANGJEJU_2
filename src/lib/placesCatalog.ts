import {
  collection,
  doc,
  getDoc,
  getDocs,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite';
import { joinPlacesCatalog, type CatalogDocument } from './placeAdapter.ts';

export type PlacesCatalog = ReturnType<typeof joinPlacesCatalog>;
const inFlight = new WeakMap<Firestore, Promise<PlacesCatalog>>();
/** Firestore getAll-style chunking without collectionGroup fan-out. */
const SOURCE_READ_CHUNK = 100;

const documentData = (snapshot: QueryDocumentSnapshot): CatalogDocument => ({
  id: snapshot.id,
  path: snapshot.ref.path,
  data: snapshot.data(),
});

export function canonicalSourcePath(placeId: string): { placeId: string; sourceId: string; path: string } | null {
  const match = /^kto-(\d+)$/.exec(placeId);
  if (!match) return null;
  const sourceId = `kto-areaBasedList2-${match[1]}`;
  return { placeId, sourceId, path: `places/${placeId}/sources/${sourceId}` };
}

export async function loadCatalogWith(
  readPlaces: () => Promise<CatalogDocument[]>,
  readSourcesForPlaces: (places: CatalogDocument[]) => Promise<CatalogDocument[]>,
) {
  // Places first, then deterministic source docs under places/{placeId}/sources/...
  // A failed source batch fails the entire load; never show a partial join.
  const places = await readPlaces();
  const sources = await readSourcesForPlaces(places);
  return joinPlacesCatalog(places, sources);
}

async function readCanonicalSources(db: Firestore, places: CatalogDocument[]): Promise<CatalogDocument[]> {
  const targets = places
    .map((place) => canonicalSourcePath(place.id))
    .filter((value): value is NonNullable<typeof value> => value !== null);

  const sources: CatalogDocument[] = [];
  for (let index = 0; index < targets.length; index += SOURCE_READ_CHUNK) {
    const chunk = targets.slice(index, index + SOURCE_READ_CHUNK);
    const snapshots = await Promise.all(
      chunk.map((target) => getDoc(doc(db, 'places', target.placeId, 'sources', target.sourceId))),
    );
    for (const snapshot of snapshots) {
      if (snapshot.exists()) sources.push(documentData(snapshot));
    }
  }
  return sources;
}

export function loadPlacesCatalog(db: Firestore): Promise<PlacesCatalog> {
  const pending = inFlight.get(db);
  if (pending) return pending;
  const request = loadCatalogWith(
    async () => (await getDocs(collection(db, 'places'))).docs.map(documentData),
    async (places) => readCanonicalSources(db, places),
  ).finally(() => inFlight.delete(db));
  // Coalesce StrictMode effect replay and simultaneous consumers, but allow retry.
  inFlight.set(db, request);
  return request;
}
