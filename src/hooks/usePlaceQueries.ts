import { useEffect, useRef, useState } from 'react';
import { db } from '../lib/firebase';
import { adaptPlace, adaptPlaceDocs, type CatalogDocument } from '../lib/placeAdapter';
import { getPlace, getPlaceSource, loadHeroPlaces, loadPlacesByIds, readSearchFields, searchPlaces } from '../lib/placeSearch';
import type { Place, PlaceCategory, RegionId } from '../types';
import type { SearchCategory, SearchRegion } from '../lib/searchTypes';
import { UI_CATEGORY_TO_SEARCH, UI_REGION_TO_SEARCH } from '../lib/searchTypes';
import { PLACE_DATA_CHANGED } from '../lib/placeInvalidation';

type Status = 'idle' | 'loading' | 'ready' | 'error';

function useRevalidation(enabled: boolean, refresh: () => void) {
  useEffect(() => {
    const revalidate = () => { if (enabled && document.visibilityState !== 'hidden') refresh(); };
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    window.addEventListener(PLACE_DATA_CHANGED, revalidate);
    return () => {
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
      window.removeEventListener(PLACE_DATA_CHANGED, revalidate);
    };
  }, [enabled, refresh]);
}

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
  useRevalidation(enabled, () => { cache.current.clear(); setPlaces([]); setAttempt((n) => n + 1); });

  useEffect(() => {
    cache.current.clear();
    setPlaces([]);
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
  useRevalidation(enabled, () => { cache.current.clear(); setPlaces([]); setAttempt((n) => n + 1); });

  useEffect(() => {
    cache.current.clear();
    setPlaces([]);
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
  const [places, setPlaces] = useState<Place[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [attempt, setAttempt] = useState(0);
  const { cache, remember } = useDocCache();
  useRevalidation(enabled, () => { cache.current.clear(); setPlaces([]); setAttempt((n) => n + 1); });

  useEffect(() => {
    cache.current.clear();
    setPlaces([]);
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
    void loadPlacesByIds(db, placeIds).then((docs) => {
      if (!active) return;
      remember(docs);
      setPlaces(adaptPlaceDocs(docs));
      setStatus('ready');
    }, () => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [enabled, attempt, accountId, placeIds.join('|')]);

  return { places, status, cache, retry: () => setAttempt((n) => n + 1) };
}
