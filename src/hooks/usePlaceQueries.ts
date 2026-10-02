import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../lib/firebase';
import { adaptPlace, adaptPlaceDocs, type CatalogDocument } from '../lib/placeAdapter';
import { getPlace, getPlaceSource, loadHeroPlaces, loadPlacesByIds, readSearchFields, searchPlaces } from '../lib/placeSearch';
import type { Place, PlaceCategory, RegionId } from '../types';
import type { SearchCategory, SearchRegion } from '../lib/searchTypes';
import { UI_CATEGORY_TO_SEARCH, UI_REGION_TO_SEARCH } from '../lib/searchTypes';
import { PLACE_DATA_CHANGED } from '../lib/placeInvalidation';

type Status = 'idle' | 'loading' | 'ready' | 'error';

type QueryResult = { docs: CatalogDocument[]; places: Place[] };
type QueryEntry = { promise: Promise<QueryResult>; result?: QueryResult };
type QueryCache = Map<string, QueryEntry>;

// Share public results and pending reads, including the list and region-count query.
const publicQueries: QueryCache = new Map();

function useRevalidation(refresh: () => void) {
  useEffect(() => {
    // Invalidate even while disabled/hidden; the next enabled render must read fresh data.
    window.addEventListener(PLACE_DATA_CHANGED, refresh);
    return () => window.removeEventListener(PLACE_DATA_CHANGED, refresh);
  }, [refresh]);
}

function readCachedPlaces(queries: QueryCache, key: string, load: () => Promise<CatalogDocument[]>) {
  const cached = queries.get(key);
  if (cached) return cached;

  const entry: QueryEntry = {
    promise: Promise.resolve().then(load).then((docs) => {
      const result = { docs, places: adaptPlaceDocs(docs) };
      entry.result = result;
      return result;
    }).catch((error) => {
      // An older failure must not evict a newer request after invalidation/retry.
      if (queries.get(key) === entry) queries.delete(key);
      throw error;
    }),
  };
  queries.set(key, entry);
  return entry;
}

function useCachedPlaces(queries: QueryCache, key: string, enabled: boolean, load: () => Promise<CatalogDocument[]>) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [attempt, setAttempt] = useState(0);
  const cache = useRef(new Map<string, CatalogDocument>());
  const generation = useRef(0);
  const invalidate = useCallback(() => {
    queries.clear();
    cache.current.clear();
    generation.current++;
    setPlaces([]);
    setAttempt((n) => n + 1);
  }, [queries]);
  useRevalidation(invalidate);

  useEffect(() => {
    cache.current.clear();
    setPlaces([]);
    if (!enabled) {
      setStatus('idle');
      return;
    }
    let active = true;
    const ticket = generation.current;
    const show = (result: QueryResult) => {
      if (!active || ticket !== generation.current) return;
      for (const doc of result.docs) cache.current.set(doc.id, doc);
      setPlaces(result.places);
      setStatus('ready');
    };
    const cached = queries.get(key);
    if (cached?.result) {
      show(cached.result);
      return;
    }
    if (!db) {
      setStatus('error');
      return;
    }
    setStatus('loading');
    void readCachedPlaces(queries, key, load).promise.then(show, () => {
      if (active && ticket === generation.current) setStatus('error');
    });
    return () => { active = false; };
  }, [queries, key, enabled, load, attempt]);

  return {
    places, status, cache,
    retry: () => {
      queries.delete(key);
      cache.current.clear();
      generation.current++;
      setPlaces([]);
      setAttempt((n) => n + 1);
    },
  };
}

export function useHeroPlaces(enabled: boolean) {
  const load = useCallback(() => loadHeroPlaces(db!), []);
  return useCachedPlaces(publicQueries, 'hero', enabled, load);
}

export function usePlaceSearch(region: RegionId, category: PlaceCategory, enabled = true) {
  const ready = enabled && region !== 'all'
    && region in UI_REGION_TO_SEARCH
    && (category === 'all' || category in UI_CATEGORY_TO_SEARCH);
  const load = useCallback(() => {
    const searchRegion = UI_REGION_TO_SEARCH[region as keyof typeof UI_REGION_TO_SEARCH] as SearchRegion;
    const searchCategory = category === 'all'
      ? undefined
      : UI_CATEGORY_TO_SEARCH[category as keyof typeof UI_CATEGORY_TO_SEARCH] as SearchCategory;
    return searchPlaces(db!, searchRegion, searchCategory);
  }, [region, category]);
  return { ...useCachedPlaces(publicQueries, `${region}:${category}`, ready, load), ready };
}

export async function enrichPlaceWithSource(
  place: Place,
  docCache: Map<string, CatalogDocument>,
): Promise<Place> {
  docCache.delete(place.id);
  if (!db) throw new Error('장소 정보를 확인하지 못했습니다.');
  const placeDoc = await getPlace(db, place.id);
  if (!placeDoc) throw new Error('현재 공개되지 않은 장소입니다.');
  docCache.set(place.id, placeDoc);
  const search = readSearchFields(placeDoc.data);
  if (!search?.primarySourceId) return adaptPlace(placeDoc, []);
  const source = await getPlaceSource(db, place.id, search.primarySourceId);
  return adaptPlace(placeDoc, source ? [source] : []);
}

export function useFavoritePlaces(placeIds: string[], enabled: boolean, accountId: string | null = null) {
  const queries = useRef<QueryCache>(new Map());
  const previousAccount = useRef(accountId);
  // Closing the drawer preserves results; logout/account changes discard them.
  useEffect(() => {
    if (previousAccount.current !== accountId) {
      queries.current.clear();
      previousAccount.current = accountId;
    }
  }, [accountId]);
  const idsKey = JSON.stringify(placeIds);
  const load = useCallback(() => loadPlacesByIds(db!, JSON.parse(idsKey) as string[]), [idsKey]);
  return useCachedPlaces(queries.current, JSON.stringify([accountId, idsKey]), enabled, load);
}
