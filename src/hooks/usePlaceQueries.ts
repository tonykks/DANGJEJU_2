import { useEffect, useRef, useState } from 'react';
import { db } from '../lib/firebase';
import { adaptPlace, adaptPlaceDocs, type CatalogDocument } from '../lib/placeAdapter';
import { getPlace, getPlaceSource, loadHeroPlaces, loadPlacesByIds, readSearchFields, searchPlaces } from '../lib/placeSearch';
import type { Place, PlaceCategory, RegionId } from '../types';
import type { SearchCategory, SearchRegion } from '../lib/searchTypes';
import { UI_CATEGORY_TO_SEARCH, UI_REGION_TO_SEARCH } from '../lib/searchTypes';

type Status = 'idle' | 'loading' | 'ready' | 'error';

function useDocCache() {
  const cache = useRef(new Map<string, CatalogDocument>());
  const remember = (docs: CatalogDocument[]) => {
    for (const doc of docs) cache.current.set(doc.id, doc);
  };
  return { cache, remember };
}

export function useHeroPlaces(enabled: boolean) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [attempt, setAttempt] = useState(0);
  const { cache, remember } = useDocCache();

  useEffect(() => {
    if (!enabled) {
      setPlaces([]);
      setStatus('idle');
      return;
    }
    let active = true;
    setStatus('loading');
    if (!db) {
      setStatus('error');
      return;
    }
    void loadHeroPlaces(db).then((docs) => {
      if (!active) return;
      remember(docs);
      setPlaces(adaptPlaceDocs(docs));
      setStatus('ready');
    }, () => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [enabled, attempt]);

  return {
    places, status, cache,
    retry: () => setAttempt((n) => n + 1),
  };
}

export function usePlaceSearch(region: RegionId, category: PlaceCategory, enabled = true) {
  const ready = enabled && region !== 'all' && category !== 'all'
    && region in UI_REGION_TO_SEARCH
    && category in UI_CATEGORY_TO_SEARCH;
  const [places, setPlaces] = useState<Place[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [attempt, setAttempt] = useState(0);
  const { cache, remember } = useDocCache();

  useEffect(() => {
    if (!ready) {
      setPlaces([]);
      setStatus('idle');
      return;
    }
    let active = true;
    setStatus('loading');
    if (!db) {
      setStatus('error');
      return;
    }
    const searchRegion = UI_REGION_TO_SEARCH[region as keyof typeof UI_REGION_TO_SEARCH] as SearchRegion;
    const searchCategory = UI_CATEGORY_TO_SEARCH[category as keyof typeof UI_CATEGORY_TO_SEARCH] as SearchCategory;
    void searchPlaces(db, searchRegion, searchCategory).then((docs) => {
      if (!active) return;
      remember(docs);
      setPlaces(adaptPlaceDocs(docs));
      setStatus('ready');
    }, () => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [ready, region, category, attempt]);

  return {
    places, status, ready, cache,
    retry: () => setAttempt((n) => n + 1),
  };
}

export async function enrichPlaceWithSource(
  place: Place,
  docCache: Map<string, CatalogDocument>,
): Promise<Place> {
  if (!db) return place;
  let placeDoc = docCache.get(place.id);
  if (!placeDoc) {
    placeDoc = await getPlace(db, place.id) ?? undefined;
    if (placeDoc) docCache.set(place.id, placeDoc);
  }
  if (!placeDoc) return place;
  const search = readSearchFields(placeDoc.data);
  if (!search?.primarySourceId) return adaptPlace(placeDoc, []);
  const source = await getPlaceSource(db, place.id, search.primarySourceId);
  return adaptPlace(placeDoc, source ? [source] : []);
}

export function useFavoritePlaces(placeIds: string[], enabled: boolean) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [attempt, setAttempt] = useState(0);
  const { cache, remember } = useDocCache();

  useEffect(() => {
    if (!enabled) {
      setPlaces([]);
      setStatus('idle');
      return;
    }
    let active = true;
    setStatus('loading');
    if (!db) {
      setStatus('error');
      return;
    }
    const missing = placeIds.filter((id) => !cache.current.has(id));
    const load = missing.length
      ? loadPlacesByIds(db, missing).then((docs) => { remember(docs); return docs; })
      : Promise.resolve([]);
    void load.then(() => {
      if (!active) return;
      const ordered = placeIds
        .map((id) => cache.current.get(id))
        .filter((doc): doc is CatalogDocument => !!doc);
      setPlaces(adaptPlaceDocs(ordered));
      setStatus('ready');
    }, () => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [enabled, attempt, placeIds.join('|')]);

  return { places, status, cache, retry: () => setAttempt((n) => n + 1) };
}
