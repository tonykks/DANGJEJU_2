import {
  collection,
  collectionGroup,
  getDocs,
  query,
  where,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite';
import { joinPlacesCatalog, type CatalogDocument } from './placeAdapter.ts';
import { createCatalogLoader, readWithQuotaRetry, type CatalogDocuments } from './placesCatalogCache.ts';

export type PlacesCatalog = ReturnType<typeof joinPlacesCatalog>;
const loaders = new WeakMap<Firestore, () => Promise<PlacesCatalog>>();

/** Firestore `in` operator limit; keep batches ≤30 so rules can constrain placeId. */
export const SOURCE_PLACE_ID_IN_LIMIT = 30;
const PLACE_ID_PATTERN = /^kto-[0-9]+$/;

const documentData = (snapshot: QueryDocumentSnapshot): CatalogDocument => ({
  id: snapshot.id,
  path: snapshot.ref.path,
  data: snapshot.data(),
});

export async function loadCatalogWith(
  readPlaces: () => Promise<CatalogDocument[]>,
  readSources: () => Promise<CatalogDocument[]>,
) {
  const places = await readPlaces();
  const sources = await readSources();
  return joinPlacesCatalog(places, sources);
}

export function catalogPlaceIdsForSourceQuery(places: CatalogDocument[]): string[] {
  return places.map((place) => place.id).filter((id) => PLACE_ID_PATTERN.test(id));
}

export async function readKtoSourcesByPlaceIds(
  placeIds: string[],
  readBatch: (ids: string[]) => Promise<CatalogDocument[]>,
): Promise<CatalogDocument[]> {
  const sources: CatalogDocument[] = [];
  for (let index = 0; index < placeIds.length; index += SOURCE_PLACE_ID_IN_LIMIT) {
    const batch = placeIds.slice(index, index + SOURCE_PLACE_ID_IN_LIMIT);
    sources.push(...await readBatch(batch));
  }
  return sources;
}

async function readCatalogDocuments(db: Firestore): Promise<CatalogDocuments> {
  const places = await readWithQuotaRetry(async () => (
    await getDocs(collection(db, 'places'))
  ).docs.map(documentData));

  // Batched collectionGroup: source==KTO AND placeId in ≤30 validated ids.
  // Matches field-gated rules (rules are not filters). No per-doc getDoc fan-out.
  const placeIds = catalogPlaceIdsForSourceQuery(places);
  const sources = await readWithQuotaRetry(async () => readKtoSourcesByPlaceIds(placeIds, async (ids) => (
    await getDocs(query(
      collectionGroup(db, 'sources'),
      where('source', '==', 'KTO'),
      where('placeId', 'in', ids),
    ))
  ).docs.map(documentData)));

  return { places, sources };
}

export function loadPlacesCatalog(db: Firestore): Promise<PlacesCatalog> {
  let load = loaders.get(db);
  if (!load) {
    const { databaseId, settings } = db.toJSON() as { databaseId: unknown; settings: { host: string; ssl: boolean } };
    load = createCatalogLoader(() => readCatalogDocuments(db), {
      key: JSON.stringify([databaseId, settings.host, settings.ssl]),
    });
    loaders.set(db, load);
  }
  return load();
}
