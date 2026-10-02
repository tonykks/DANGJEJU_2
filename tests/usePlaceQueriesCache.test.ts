import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import * as adapter from '../src/lib/placeAdapter.ts';
import * as searchTypes from '../src/lib/searchTypes.ts';
import { PLACE_DATA_CHANGED } from '../src/lib/placeInvalidation.ts';
import { isQuotaError } from '../src/lib/firestoreQuota.ts';
import type { PlaceCategory, RegionId } from '../src/types.ts';

// Execute the production modules with isolated hook state and mocked I/O. No Firebase
// initialization or network reads are needed, and every test gets fresh module caches.
const compiled = new Map<string, string>();
function evaluate<T>(path: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  if (!compiled.has(path)) {
    compiled.set(path, ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText);
  }
  const module = { exports: {} };
  const require = (name: string) => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  };
  new Function('require', 'exports', ...Object.keys(globals), compiled.get(path)!)(require, module.exports, ...Object.values(globals));
  return module.exports as T;
}

type Effect = () => void | (() => void);
type Slot = { value?: any; deps?: unknown[]; effect?: Effect; cleanup?: void | (() => void) };
function hookRuntime() {
  let current: { slots: Slot[]; cursor: number; dirty: boolean; pending: Set<number> };
  const mounted = new Set<ReturnType<typeof mount>>();
  const same = (a?: unknown[], b?: unknown[]) => Boolean(a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i])));
  const react = {
    useState(initial: unknown) {
      const host = current;
      const index = host.cursor++;
      const slot = host.slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slot.value, (next: any) => {
        const value = typeof next === 'function' ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) { slot.value = value; host.dirty = true; }
      }];
    },
    useRef(value: unknown) {
      return (current.slots[current.cursor++] ??= { value: { current: value } }).value;
    },
    useCallback(callback: unknown, deps: unknown[]) {
      const slot = current.slots[current.cursor++] ??= {};
      if (!same(slot.deps, deps)) { slot.value = callback; slot.deps = deps; }
      return slot.value;
    },
    useEffect(effect: Effect, deps?: unknown[]) {
      const index = current.cursor++;
      const slot = current.slots[index] ??= {};
      if (!same(slot.deps, deps)) {
        slot.deps = deps;
        slot.effect = effect;
        current.pending.add(index);
      }
    },
  };
  function mount<T>(render: () => T) {
    const host = {
      slots: [] as Slot[], cursor: 0, dirty: true, pending: new Set<number>(), result: undefined as T,
      render() {
        host.cursor = 0;
        host.dirty = false;
        current = host;
        host.result = render();
        const pending = [...host.pending].map((i) => host.slots[i]);
        host.pending.clear();
        for (const slot of pending) if (slot.cleanup) slot.cleanup();
        for (const slot of pending) slot.cleanup = slot.effect!();
      },
      rerender() { host.dirty = true; },
      replayEffects() {
        for (const slot of host.slots) if (slot.cleanup) slot.cleanup();
        for (const slot of host.slots) if (slot.effect) slot.cleanup = slot.effect();
      },
      unmount() {
        for (const slot of host.slots) if (slot.cleanup) slot.cleanup();
        mounted.delete(host);
      },
    };
    mounted.add(host);
    host.render();
    return host;
  }
  async function flush() {
    for (let pass = 0; pass < 30; pass++) {
      for (const host of mounted) if (host.dirty) host.render();
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (![...mounted].some((host) => host.dirty)) return;
    }
    assert.fail('Hook renders did not settle');
  }
  return { react, mount, flush };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const document = (id = 'kto-1', name = id): adapter.CatalogDocument => ({
  id, path: `places/${id}`, data: { placeId: id, name, publicationStatus: 'PUBLISHED' },
});
type Documents = adapter.CatalogDocument[];
type QueryHooks = typeof import('../src/hooks/usePlaceQueries.ts');
function setup(read: {
  hero?: () => Promise<Documents>;
  search?: (region: string, category?: string) => Promise<Documents>;
  favorites?: (ids: string[]) => Promise<Documents>;
} = {}) {
  const runtime = hookRuntime();
  const window = Object.assign(new EventTarget(), { setTimeout: () => 1, clearTimeout: () => {} });
  const browserDocument = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const reads = { hero: 0, search: [] as unknown[][], favorites: [] as string[][], detail: 0 };
  const hooks = evaluate<QueryHooks>('../src/hooks/usePlaceQueries.ts', {
    react: runtime.react,
    '../lib/firebase': { db: {} },
    '../lib/placeAdapter': adapter,
    '../lib/searchTypes': searchTypes,
    '../lib/placeInvalidation': { PLACE_DATA_CHANGED },
    '../lib/placeSearch': {
      loadHeroPlaces: () => { reads.hero++; return read.hero?.() ?? Promise.resolve([document()]); },
      searchPlaces: (_db: unknown, region: string, category?: string) => {
        reads.search.push([region, category]);
        return read.search?.(region, category) ?? Promise.resolve([document('kto-2', `${region}:${category}`)]);
      },
      loadPlacesByIds: (_db: unknown, ids: string[]) => {
        reads.favorites.push(ids);
        return read.favorites?.(ids) ?? Promise.resolve(ids.map((id) => document(id)));
      },
      getPlace: async (_db: unknown, id: string) => { reads.detail++; return document(id); },
      readSearchFields: () => null,
    },
  }, { window, document: browserDocument });
  return { ...runtime, hooks, window, browserDocument, reads };
}

test('hero re-entry and remount reuse results and restore the document cache, including empty results', async () => {
  for (const docs of [[document()], []]) {
    const h = setup({ hero: async () => docs });
    let enabled = true;
    const hero = h.mount(() => h.hooks.useHeroPlaces(enabled));
    await h.flush();
    assert.equal(hero.result.status, 'ready');
    assert.deepEqual(Object.keys(hero.result).sort(), ['cache', 'places', 'retry', 'status']);
    const places = hero.result.places;
    enabled = false; hero.rerender(); await h.flush();
    assert.equal(hero.result.status, 'idle');
    assert.deepEqual(hero.result.places, []);
    enabled = true; hero.rerender(); await h.flush();
    assert.equal(hero.result.places, places);
    assert.equal(hero.result.cache.current.size, docs.length);
    assert.equal(h.reads.hero, 1);
    hero.unmount();
    const remount = h.mount(() => h.hooks.useHeroPlaces(true));
    await h.flush();
    assert.equal(remount.result.places, places);
    assert.equal(h.reads.hero, 1);
  }
});

test('search caches each region/category and shares concurrent list/count requests', async () => {
  const h = setup();
  let region: RegionId = 'west';
  let category: PlaceCategory = 'all';
  let enabled = true;
  const search = h.mount(() => h.hooks.usePlaceSearch(region, category, enabled));
  const count = h.mount(() => h.hooks.usePlaceSearch(region, 'all', enabled));
  await h.flush();
  assert.equal(h.reads.search.length, 1);
  assert.equal(search.result.places, count.result.places);
  assert.equal(search.result.ready, true);
  category = 'cafe'; search.rerender(); await h.flush();
  region = 'east'; search.rerender(); await h.flush();
  region = 'west'; category = 'all'; search.rerender(); await h.flush();
  assert.deepEqual(h.reads.search, [['WEST', undefined], ['WEST', 'CAFE'], ['EAST', 'CAFE']]);
  assert.equal(search.result.places, count.result.places);
  assert.equal(search.result.cache.current.get('kto-2')?.data.name, 'WEST:undefined');
  enabled = false; search.rerender(); await h.flush();
  assert.equal(search.result.ready, false);
  assert.equal(search.result.status, 'idle');
  enabled = true; search.rerender(); await h.flush();
  assert.equal(h.reads.search.length, 3);
  region = 'all'; search.rerender(); await h.flush();
  assert.equal(search.result.status, 'idle');
  assert.equal(h.reads.search.length, 3);
});

test('favorites reuse unchanged IDs on reopen, fetch changed IDs and clear cache on account switch/logout', async () => {
  const h = setup();
  let ids = ['kto-1'];
  let enabled = true;
  let account: string | null = 'A';
  const favorites = h.mount(() => h.hooks.useFavoritePlaces([...ids], enabled, account));
  await h.flush();
  const places = favorites.result.places;
  favorites.rerender(); await h.flush();
  enabled = false; favorites.rerender(); await h.flush();
  enabled = true; favorites.rerender(); await h.flush();
  assert.equal(favorites.result.places, places);
  assert.equal(h.reads.favorites.length, 1);
  ids = ['kto-1', 'kto-2']; favorites.rerender(); await h.flush();
  assert.equal(favorites.result.places.length, 2);
  assert.equal(h.reads.favorites.length, 2);
  account = 'B'; favorites.rerender(); await h.flush();
  assert.equal(h.reads.favorites.length, 3);
  account = null; enabled = false; favorites.rerender(); await h.flush();
  assert.deepEqual(favorites.result.places, []);
  assert.equal(favorites.result.cache.current.size, 0);
  account = 'A'; enabled = true; favorites.rerender(); await h.flush();
  assert.equal(h.reads.favorites.length, 4);
  ids = []; favorites.rerender(); await h.flush();
  assert.equal(favorites.result.status, 'ready');
  assert.deepEqual(favorites.result.places, []);
});

test('retry bypasses a successful cache for hero, search and favorites', async () => {
  const h = setup();
  const hero = h.mount(() => h.hooks.useHeroPlaces(true));
  const search = h.mount(() => h.hooks.usePlaceSearch('west', 'cafe'));
  const favorites = h.mount(() => h.hooks.useFavoritePlaces(['kto-1'], true, 'A'));
  await h.flush();
  for (const host of [hero, search, favorites]) host.result.retry();
  await h.flush();
  assert.equal(h.reads.hero, 2);
  assert.equal(h.reads.search.length, 2);
  assert.equal(h.reads.favorites.length, 2);
  for (const host of [hero, search, favorites]) assert.equal(host.result.status, 'ready');
});

test('PLACE_DATA_CHANGED refreshes enabled hooks even in a hidden tab and invalidates other search keys', async () => {
  const h = setup();
  let category: PlaceCategory = 'all';
  const hero = h.mount(() => h.hooks.useHeroPlaces(true));
  const search = h.mount(() => h.hooks.usePlaceSearch('west', category));
  const count = h.mount(() => h.hooks.usePlaceSearch('west', 'all'));
  const favorites = h.mount(() => h.hooks.useFavoritePlaces(['kto-1'], true, 'A'));
  await h.flush();
  category = 'cafe'; search.rerender(); await h.flush();
  category = 'all'; search.rerender(); await h.flush();
  h.browserDocument.visibilityState = 'hidden';
  h.window.dispatchEvent(new Event(PLACE_DATA_CHANGED));
  await h.flush();
  assert.equal(h.reads.hero, 2);
  assert.equal(h.reads.search.length, 3);
  assert.equal(h.reads.favorites.length, 2);
  for (const host of [hero, search, count, favorites]) assert.equal(host.result.status, 'ready');
  category = 'cafe'; search.rerender(); await h.flush();
  assert.equal(h.reads.search.length, 4);
});

test('PLACE_DATA_CHANGED invalidates disabled hooks without reading until they are enabled', async () => {
  const h = setup();
  let enabled = true;
  const hero = h.mount(() => h.hooks.useHeroPlaces(enabled));
  const search = h.mount(() => h.hooks.usePlaceSearch('west', 'cafe', enabled));
  const favorites = h.mount(() => h.hooks.useFavoritePlaces(['kto-1'], enabled, 'A'));
  const hosts = [hero, search, favorites];
  await h.flush();
  enabled = false; hosts.forEach((host) => host.rerender()); await h.flush();
  h.window.dispatchEvent(new Event(PLACE_DATA_CHANGED)); await h.flush();
  assert.equal(h.reads.hero, 1);
  assert.equal(h.reads.search.length, 1);
  assert.equal(h.reads.favorites.length, 1);
  for (const host of hosts) assert.equal(host.result.status, 'idle');
  enabled = true; hosts.forEach((host) => host.rerender()); await h.flush();
  assert.equal(h.reads.hero, 2);
  assert.equal(h.reads.search.length, 2);
  assert.equal(h.reads.favorites.length, 2);
});

test('focus and visibilitychange preserve hook results and never trigger reads', async () => {
  const h = setup();
  const hosts = [
    h.mount(() => h.hooks.useHeroPlaces(true)),
    h.mount(() => h.hooks.usePlaceSearch('west', 'cafe')),
    h.mount(() => h.hooks.useFavoritePlaces(['kto-1'], true, 'A')),
  ];
  await h.flush();
  const places = hosts.map((host) => host.result.places);
  for (const visibility of ['hidden', 'visible', 'visible']) {
    h.browserDocument.visibilityState = visibility;
    h.browserDocument.dispatchEvent(new Event('visibilitychange'));
    h.window.dispatchEvent(new Event('focus'));
    await h.flush();
  }
  assert.equal(h.reads.hero, 1);
  assert.equal(h.reads.search.length, 1);
  assert.equal(h.reads.favorites.length, 1);
  hosts.forEach((host, i) => {
    assert.equal(host.result.status, 'ready');
    assert.equal(host.result.places, places[i]);
  });
});

test('pending reads survive effect replay and disable/re-enable without duplicate requests', async () => {
  const pending = deferred<Documents>();
  const h = setup({ hero: () => pending.promise, favorites: () => pending.promise });
  let enabled = true;
  const hero = h.mount(() => h.hooks.useHeroPlaces(enabled));
  const favorites = h.mount(() => h.hooks.useFavoritePlaces(['kto-1'], enabled, 'A'));
  hero.replayEffects(); favorites.replayEffects(); await h.flush();
  enabled = false; hero.rerender(); favorites.rerender(); await h.flush();
  enabled = true; hero.rerender(); favorites.rerender(); await h.flush();
  assert.equal(h.reads.hero, 1);
  assert.equal(h.reads.favorites.length, 1);
  pending.resolve([document()]); await h.flush();
  assert.equal(hero.result.status, 'ready');
  assert.equal(favorites.result.status, 'ready');
});

test('invalidated late success/failure cannot overwrite or evict a refreshed result', async () => {
  for (const fail of [false, true]) {
    const old = deferred<Documents>();
    let first = true;
    const h = setup({ hero: () => {
      if (first) { first = false; return old.promise; }
      return Promise.resolve([document('kto-2', 'fresh')]);
    } });
    const hero = h.mount(() => h.hooks.useHeroPlaces(true));
    await h.flush();
    h.window.dispatchEvent(new Event(PLACE_DATA_CHANGED)); await h.flush();
    fail ? old.reject(new Error('late failure')) : old.resolve([document('kto-1', 'stale')]);
    await h.flush();
    assert.equal(hero.result.places[0].name, 'fresh');
    assert.equal(hero.result.cache.current.has('kto-1'), false);
    hero.unmount();
    const remount = h.mount(() => h.hooks.useHeroPlaces(true)); await h.flush();
    assert.equal(remount.result.places[0].name, 'fresh');
    assert.equal(h.reads.hero, 2);
  }
});

test('late results from another search/account never populate the current result or document cache', async () => {
  const oldSearch = deferred<Documents>();
  const oldFavorites = deferred<Documents>();
  let account: string | null = 'A';
  let region: RegionId = 'west';
  const h = setup({
    search: (value) => value === 'WEST' ? oldSearch.promise : Promise.resolve([document('kto-2')]),
    favorites: () => account === 'A' ? oldFavorites.promise : Promise.resolve([document('kto-2')]),
  });
  const search = h.mount(() => h.hooks.usePlaceSearch(region, 'cafe'));
  const favorites = h.mount(() => h.hooks.useFavoritePlaces(['kto-1', 'kto-2'], Boolean(account), account));
  await h.flush();
  region = 'east'; account = 'B'; search.rerender(); favorites.rerender(); await h.flush();
  oldSearch.resolve([document()]); oldFavorites.resolve([document()]); await h.flush();
  for (const host of [search, favorites]) {
    assert.deepEqual(host.result.places.map((place) => place.id), ['kto-2']);
    assert.equal(host.result.cache.current.has('kto-1'), false);
  }
  account = null; favorites.rerender(); await h.flush();
  assert.deepEqual(favorites.result.places, []);
});

test('failed loads are not successful cached results and manual retry recovers', async () => {
  let fail = true;
  const h = setup({ hero: async () => { if (fail) throw new Error('offline'); return [document()]; } });
  const hero = h.mount(() => h.hooks.useHeroPlaces(true)); await h.flush();
  assert.equal(hero.result.status, 'error');
  assert.equal(hero.result.cache.current.size, 0);
  fail = false; hero.result.retry(); await h.flush();
  assert.equal(hero.result.status, 'ready');
  assert.equal(h.reads.hero, 2);
});

type Element = { type: unknown; props: Record<string, any> };
function findElement(tree: any, type: string): Element | undefined {
  if (!tree || typeof tree !== 'object') return;
  if (tree.type === type) return tree;
  for (const child of Array.isArray(tree) ? tree : [tree.props?.children]) {
    const found = findElement(child, type);
    if (found) return found;
  }
}

test('App keeps an open detail on focus/tab return and resets it only on explicit data invalidation', async () => {
  const h = setup();
  const imports: Record<string, unknown> = {
    react: h.react,
    'react/jsx-runtime': { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) },
    './data/places': { REGIONS: [{ id: 'all' }, { id: 'west' }] },
    './hooks/usePlaceQueries': h.hooks,
    './lib/placeInvalidation': { PLACE_DATA_CHANGED },
    './hooks/useHashRoute': { useHashRoute: () => ({ route: 'home' }) },
    './hooks/useAdminAccess': { useAdminAccess: () => ({ status: 'signed-out', active: false }) },
    './hooks/useAuthFavorites': { useAuthFavorites: () => ({ user: null, savedPlaceIds: [], pendingIds: [] }) },
    'lucide-react': {},
  };
  for (const name of ['Header', 'PlaceCard', 'PlaceListItem', 'PlaceDetailModal', 'JejuMap', 'SavedPlacesDrawer', 'LoadingScreen', 'EventBannerSlider', 'AdminPlaceEditor']) {
    imports[`./components/${name}`] = { default: name };
  }
  const { default: App } = evaluate<{ default: () => Element }>('../src/App.tsx', imports, { window: h.window, document: h.browserDocument });
  const app = h.mount(App); await h.flush();
  const card = findElement(app.result, 'PlaceCard')!;
  assert.ok(card);
  await card.props.onOpenDetail(card.props.place); await h.flush();
  const detail = findElement(app.result, 'PlaceDetailModal')!;
  assert.equal(detail.props.isOpen, true);
  assert.equal(h.reads.detail, 1);
  for (const visibility of ['hidden', 'visible']) {
    h.browserDocument.visibilityState = visibility;
    h.browserDocument.dispatchEvent(new Event('visibilitychange'));
    h.window.dispatchEvent(new Event('focus'));
    await h.flush();
    const current = findElement(app.result, 'PlaceDetailModal')!;
    assert.equal(current.props.isOpen, true);
    assert.equal(current.props.place, detail.props.place);
  }
  assert.equal(h.reads.detail, 1);
  assert.equal(h.reads.hero, 1);
  h.window.dispatchEvent(new Event(PLACE_DATA_CHANGED)); await h.flush();
  assert.equal(findElement(app.result, 'PlaceDetailModal')!.props.isOpen, false);
  assert.equal(findElement(app.result, 'PlaceDetailModal')!.props.place, null);
  assert.equal(h.reads.hero, 2);
  assert.equal(h.reads.detail, 1);
  app.unmount();
  h.window.dispatchEvent(new Event(PLACE_DATA_CHANGED)); await h.flush();
  assert.equal(h.reads.hero, 2);
});

test('isQuotaError accepts Firestore/HTTP codes and message-only quota errors', () => {
  for (const code of ['resource-exhausted', 'firestore/resource-exhausted', '429', 429]) {
    assert.equal(isQuotaError({ code }), true);
  }
  for (const message of ['RESOURCE_EXHAUSTED', 'Firestore: RESOURCE_EXHAUSTED: read limit', 'Quota exceeded.', 'quota exceeded for project']) {
    assert.equal(isQuotaError(new Error(message)), true);
    assert.equal(isQuotaError({ message }), true);
  }
  for (const value of [null, undefined, 429, 'Quota exceeded', {}, { code: 'permission-denied' }, { message: 429 }, new Error('offline'), new Error('QuotaExceededError')]) {
    assert.equal(isQuotaError(value), false);
  }
});

type Quota = typeof import('../src/lib/firestoreQuota.ts');
const quotaModule = (sessionStorage?: unknown) => evaluate<Quota>('../src/lib/firestoreQuota.ts', {}, { sessionStorage });

test('quota cooldown lasts exactly 60 seconds in memory and sessionStorage, including module reload', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
  const quota = quotaModule(storage);
  quota.assertNotInQuotaCooldown(1000);
  quota.markQuotaFailure(1000);
  assert.equal(values.get('dangjeju:firestore:quota-cooldown'), '61000');
  const reload = quotaModule(storage);
  for (const module of [quota, reload]) {
    assert.throws(() => module.assertNotInQuotaCooldown(60999), { code: 'resource-exhausted' });
    assert.doesNotThrow(() => module.assertNotInQuotaCooldown(61000));
  }
});

test('quota cooldown tolerates missing/blocked storage and ignores malformed stored timestamps', () => {
  for (const storage of [undefined, { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } }]) {
    const quota = quotaModule(storage);
    quota.markQuotaFailure(1000);
    assert.throws(() => quota.assertNotInQuotaCooldown(60999), { code: 'resource-exhausted' });
    assert.doesNotThrow(() => quota.assertNotInQuotaCooldown(61000));
  }
  for (const value of ['bad', 'Infinity', '-1', null]) {
    const quota = quotaModule({ getItem: () => value });
    assert.doesNotThrow(() => quota.assertNotInQuotaCooldown(1000));
  }
});
