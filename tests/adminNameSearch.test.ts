import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import * as firestore from 'firebase/firestore/lite';
import * as effective from '../src/lib/effectivePlace';
import * as identity from '../src/lib/placeIdentity';
import * as derivation from '../src/lib/searchDerivation';
import * as searchTypes from '../src/lib/searchTypes';
import * as quota from '../src/lib/firestoreQuota';
import * as adapter from '../src/lib/placeAdapter';
import * as adminEditor from '../src/lib/adminPlaceEditor';
import { PLACE_DATA_CHANGED } from '../src/lib/placeInvalidation';
import type { CatalogDocument } from '../src/lib/placeAdapter';

// Execute the real query, component and batch code with isolated hooks and I/O.
// No production Firebase configuration, reads or writes are used by this suite.
const compiled = new Map<string, string>();
function evaluate<T>(path: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  if (!compiled.has(path)) compiled.set(path, ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText);
  const exports = {};
  new Function('require', 'exports', ...Object.keys(globals), compiled.get(path)!)(
    (name: string) => { assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name]; }, exports, ...Object.values(globals),
  );
  return exports as T;
}

type Element = { type: string; props: Record<string, any> };
type Effect = () => void | (() => void);
function hooks() {
  const slots: { value?: any; deps?: unknown[]; effect?: Effect; cleanup?: void | (() => void) }[] = [];
  let cursor = 0, dirty = true;
  const pending = new Set<number>();
  const react = {
    useState(initial: any) {
      const slot = slots[cursor++] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slot.value, (next: any) => {
        const value = typeof next === 'function' ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; }
      }];
    },
    useRef(value: any) { return (slots[cursor++] ??= { value: { current: value } }).value; },
    useMemo(factory: () => any, deps: unknown[]) {
      const slot = slots[cursor++] ??= {};
      if (!slot.deps || deps.some((v, i) => !Object.is(v, slot.deps![i]))) { slot.value = factory(); slot.deps = deps; }
      return slot.value;
    },
    useCallback(callback: any, deps: unknown[]) { return react.useMemo(() => callback, deps); },
    useEffect(effect: Effect, deps: unknown[]) {
      const index = cursor++, slot = slots[index] ??= {};
      if (!slot.deps || deps.some((v, i) => !Object.is(v, slot.deps![i]))) {
        slot.deps = deps; slot.effect = effect; pending.add(index);
      }
    },
  };
  let render: () => Element, tree: Element;
  return {
    react,
    mount(component: () => Element) { render = component; },
    get tree() { return tree; },
    async flush() {
      for (let i = 0; i < 30; i++) {
        if (dirty) {
          cursor = 0; dirty = false; tree = render();
          const effects = [...pending].map((index) => slots[index]); pending.clear();
          for (const slot of effects) if (slot.cleanup) slot.cleanup();
          for (const slot of effects) slot.cleanup = slot.effect!();
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
        if (!dirty) return;
      }
      assert.fail('Component did not settle');
    },
    unmount() { for (const slot of slots) if (slot.cleanup) slot.cleanup(); },
  };
}
function elements(tree: any): Element[] {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return [tree, ...elements(tree.props?.children)];
}
function textOf(tree: any): string {
  if (tree == null || typeof tree === 'boolean') return '';
  if (Array.isArray(tree)) return tree.map(textOf).join('');
  return typeof tree === 'object' ? textOf(tree.props?.children) : String(tree);
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const place = (id: number, status = 'DRAFT', name = `제주 ${id}`): CatalogDocument => ({
  id: `kto-${id}`, path: `places/kto-${id}`, data: { name, publicationStatus: status, updatedAt: 'v1',
    search: { region: 'WEST', category: 'CAFE' },
    manualAdmin: status === 'HIDDEN' ? { previousPublicationStatus: 'PUBLISHED' } : {},
  },
});

function library(fixtures = [place(1), place(2, 'PUBLISHED'), place(3, 'HIDDEN'), place(4, 'ARCHIVED')]) {
  const docs = new Map(fixtures.map((p) => [p.id, structuredClone(p)]));
  const queries: { kind: string; value: any }[][] = [];
  const constraints = Object.fromEntries(['orderBy', 'startAt', 'startAfter', 'endAt', 'limit'].map((kind) => [kind, (value: any) => ({ kind, value })]));
  const snapshot = (p: CatalogDocument) => ({ id: p.id, ref: { path: p.path }, exists: () => true, data: () => structuredClone(p.data) });
  const pages: ReturnType<typeof snapshot>[][] = [];
  const api = evaluate<typeof import('../src/lib/adminPlaceEditor')>('../src/lib/adminPlaceEditor.ts', {
    'firebase/firestore/lite': {
      ...firestore, ...constraints, collection: (_db: unknown, path: string) => path,
      query: (path: string, ...parts: any[]) => { assert.equal(path, 'places'); return parts; },
      getDocs: async (parts: { kind: string; value: any }[]) => {
        queries.push(parts);
        const get = (kind: string) => parts.find((p) => p.kind === kind)?.value;
        assert.equal(get('orderBy'), 'name'); assert.ok(get('endAt')); assert.ok(get('limit') > 0);
        const cursor = get('startAfter');
        assert.deepEqual(parts.map((p) => p.kind), ['orderBy', cursor ? 'startAfter' : 'startAt', 'endAt', 'limit']);
        let ordered = [...docs.values()].filter((p) => (!get('startAt') || String(p.data.name) >= get('startAt')) && String(p.data.name) <= get('endAt'))
          .sort((a, b) => {
            const aKey = String(a.data.name), bKey = String(b.data.name);
            return aKey === bKey ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : aKey < bKey ? -1 : 1;
          });
        if (cursor) {
          // Require the last raw document, even when it was filtered out.
          assert.equal(cursor, pages.at(-1)!.at(-1));
          const index = ordered.findIndex((p) => p.id === cursor.id);
          assert.ok(index >= 0);
          ordered = ordered.slice(index + 1);
        } else assert.ok(get('startAt'));
        const page = ordered.slice(0, get('limit')).map(snapshot);
        pages.push(page);
        return { docs: page };
      },
      doc: (_db: unknown, _collection: string, id: string) => ({ id }),
      serverTimestamp: () => 'v2',
      runTransaction: async (_db: unknown, work: any) => work({
        get: async ({ id }: { id: string }) => snapshot(docs.get(id)!),
        update: ({ path }: { path: string }, patch: Record<string, unknown>) => {
          const original = docs.get(path.split('/')[1])!;
          original.data = { ...original.data, ...patch };
        },
      }),
    },
    './effectivePlace': effective, './searchDerivation': derivation, './placeIdentity': identity,
    './searchTypes': searchTypes, './firestoreQuota': quota,
    './placeSearch': { guardedFirestoreRead: (work: () => unknown) => work(), getAdminPlace: async (_db: unknown, id: string) => docs.get(id) },
  });
  return { api, docs, queries, pages, db: {} as firestore.Firestore };
}

async function manager(options: { name?: (...args: any[]) => Promise<CatalogDocument[]>; region?: (...args: any[]) => Promise<any> } = {}) {
  const lib = library(), runtime = hooks(), window = new EventTarget();
  const calls = { names: [] as any[][], regions: [] as any[][], batches: [] as { action: string; targets: CatalogDocument[] }[], edits: [] as string[], invalidations: 0, clears: 0, editing: null as string | null };
  const api = {
    ...lib.api,
    searchAdminPlacesByName: (...args: Parameters<typeof lib.api.searchAdminPlacesByName>) => {
      calls.names.push(args); return options.name ? options.name(...args) : lib.api.searchAdminPlacesByName(...args);
    },
    searchAdminPlacesByRegionAndCategory: (...args: any[]) => {
      calls.regions.push(args); return options.region?.(...args) ?? Promise.resolve({ places: [place(10)], cursor: null, hasMore: false });
    },
    batchHideAdminPlaces: (...args: Parameters<typeof lib.api.batchHideAdminPlaces>) => {
      calls.batches.push({ action: 'hide', targets: args[1] }); return lib.api.batchHideAdminPlaces(...args);
    },
    batchRestoreAdminPlaces: (...args: Parameters<typeof lib.api.batchRestoreAdminPlaces>) => {
      calls.batches.push({ action: 'restore', targets: args[1] }); return lib.api.batchRestoreAdminPlaces(...args);
    },
  };
  const { AdminRegionManager } = evaluate<{ AdminRegionManager: (props: any) => Element }>('../src/components/AdminPlaceCrud.tsx', {
    react: runtime.react, 'react/jsx-runtime': { jsx: (type: string, props: any) => ({ type, props }), jsxs: (type: string, props: any) => ({ type, props }) },
    '../lib/firebase': { db: lib.db }, '../lib/adminPlaceEditor': api, '../lib/effectivePlace': effective, '../lib/placeIdentity': identity,
    '../lib/placeInvalidation': { PLACE_DATA_CHANGED, invalidatePlaceQueries: () => { calls.invalidations++; window.dispatchEvent(new Event(PLACE_DATA_CHANGED)); } },
  }, { window });
  const onBusyChange = () => {};
  const onClearEdit = () => { calls.clears++; calls.editing = null; };
  runtime.mount(() => AdminRegionManager({ onEdit: (id: string) => { calls.edits.push(id); calls.editing = id; }, onBusyChange, onClearEdit }));
  await runtime.flush();
  const all = () => elements(runtime.tree);
  const find = (predicate: (el: Element) => boolean) => { const element = all().find(predicate); assert.ok(element, 'Expected UI element'); return element; };
  const button = (label: string) => find((el) => el.type === 'button' && textOf(el) === label);
  return {
    ...lib, ...runtime, calls, window, all, button,
    content: () => textOf(runtime.tree),
    async click(label: string) { const el = button(label); assert.ok(!el.props.disabled, label); el.props.onClick(); await runtime.flush(); },
    async type(value: string) { find((el) => el.type === 'input' && el.props.type === 'text').props.onChange({ target: { value } }); await runtime.flush(); },
    async enter(composing = false) { find((el) => el.type === 'input' && el.props.type === 'text').props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: composing }, preventDefault() {} }); await runtime.flush(); },
    async select(label: string, value: string) { find((el) => el.props['aria-label'] === label).props.onChange({ target: { value } }); await runtime.flush(); },
    async check(name: string) { find((el) => el.props['aria-label'] === `${name} 선택`).props.onChange(); await runtime.flush(); },
    async edit(name: string) { const el = find((el) => el.type === 'button' && textOf(el).startsWith(`${name}주소`)); assert.ok(!el.props.disabled); el.props.onClick(); await runtime.flush(); },
  };
}

async function editor(load: (id: string) => Promise<{ place: CatalogDocument; source: CatalogDocument }>) {
  const lib = library(), runtime = hooks();
  let invalidate = () => {};
  const { default: AdminPlaceEditor } = evaluate<{ default: (props: any) => Element }>('../src/components/AdminPlaceEditor.tsx', {
    react: runtime.react, 'react/jsx-runtime': { jsx: (type: string, props: any) => ({ type, props }), jsxs: (type: string, props: any) => ({ type, props }) },
    'lucide-react': {}, '../lib/firebase': { db: lib.db }, '../lib/placeAdapter': adapter,
    './AdminPlaceCrud': { AdminRegionManager: 'AdminRegionManager' },
    '../lib/placeInvalidation': { invalidatePlaceQueries: () => invalidate() },
    '../lib/adminPlaceEditor': { ...adminEditor, loadAdminPlace: (_db: unknown, id: string) => load(id), saveAdminPlace: async () => {} },
  });
  runtime.mount(() => AdminPlaceEditor({ uid: 'test-admin', onHome() {} }));
  await runtime.flush();
  const all = () => elements(runtime.tree);
  const button = (label: string) => { const el = all().find((el) => el.type === 'button' && textOf(el) === label); assert.ok(el); return el; };
  button('지역·업종 관리').props.onClick(); await runtime.flush();
  const managerProps = () => all().find((el) => el.type === 'AdminRegionManager')!.props;
  return {
    ...runtime, all, button, managerProps,
    onInvalidation(callback: () => void) { invalidate = callback; },
    async prepareEdit() {
      all().find((el) => el.type === 'input' && el.props.type === 'checkbox')!.props.onChange(); await runtime.flush();
      all().find((el) => el.props.definition?.id === 'name')!.props.onChange('제주 수정'); await runtime.flush();
      button('변경 확인').props.onClick(); await runtime.flush();
    },
    hasDetails: () => all().some((el) => el.type === 'h3' && textOf(el).startsWith('제주')),
  };
}

const loadedPlace = (id = 1) => ({ place: { ...place(id), data: { ...place(id).data, placeId: `kto-${id}` } }, source: { id: 'source', path: `places/kto-${id}/sources/source`, data: {} } });

test('name query keeps legacy results and applies visible/hidden filters within bounded prefix reads', async () => {
  const h = library();
  assert.deepEqual((await h.api.searchAdminPlacesByName(h.db, ' 제주 ')).map((p) => p.id), ['kto-1', 'kto-2', 'kto-3', 'kto-4']);
  assert.deepEqual((await h.api.searchAdminPlacesByName(h.db, '제주', { hidden: false })).map((p) => p.id), ['kto-1', 'kto-2']);
  assert.deepEqual((await h.api.searchAdminPlacesByName(h.db, '제주', { hidden: true })).map((p) => p.id), ['kto-3']);
  assert.deepEqual(h.queries.map((q) => q.find((p) => p.kind === 'limit')?.value), [12, 30, 30]);
  for (const q of h.queries) assert.deepEqual(q.map((p) => p.kind), ['orderBy', 'startAt', 'endAt', 'limit']);
  assert.equal(h.queries[0].find((p) => p.kind === 'endAt')?.value, '제주\uf8ff');
  const many = library(Array.from({ length: 50 }, (_, i) => place(i, 'DRAFT', `제주 ${String(i).padStart(2, '0')}`)));
  assert.equal((await many.api.searchAdminPlacesByName(many.db, '제주', { hidden: false, limit: 3 })).length, 3);
  assert.equal(many.queries[0].find((p) => p.kind === 'limit')?.value, 30);
  assert.equal((await many.api.searchAdminPlacesByName(many.db, '제주', { limit: 2 })).length, 2);
  assert.equal((await many.api.searchAdminPlacesByName(many.db, '제주', { hidden: false, limit: 20 })).length, 20);
  assert.equal(many.queries.at(-1)!.find((p) => p.kind === 'limit')?.value, 30);
  const before = h.queries.length;
  for (const value of ['', '   ', '가'.repeat(81)]) await assert.rejects(h.api.searchAdminPlacesByName(h.db, value));
  for (const limit of [0, -1, 1.5, NaN]) await assert.rejects(h.api.searchAdminPlacesByName(h.db, '제주', { limit }));
  assert.equal(h.queries.length, before);
});

test('filtered name query continues past a full page with no matching status and exits at 12 results', async () => {
  for (const hidden of [false, true]) {
    const fixtures = Array.from({ length: 90 }, (_, i) => place(i,
      i < 30 ? (hidden ? 'DRAFT' : 'HIDDEN') : hidden ? 'HIDDEN' : i % 2 ? 'PUBLISHED' : 'DRAFT',
      `제주 ${String(i).padStart(3, '0')}`));
    const h = library([...fixtures].reverse());
    const found = await h.api.searchAdminPlacesByName(h.db, ' 제주 ', { hidden });
    assert.deepEqual(found.map((p) => p.id), fixtures.slice(30, 42).map((p) => p.id));
    assert.deepEqual(h.pages.map((page) => page.length), [30, 30]);
    for (const q of h.queries) {
      assert.equal(q.find((p) => p.kind === 'limit')?.value, 30);
      assert.equal(q.find((p) => p.kind === 'endAt')?.value, '제주\uf8ff');
    }
    assert.equal(h.queries[0].find((p) => p.kind === 'startAt')?.value, '제주');
  }
});

test('filtered name query fills only the requested count and skips extra reads after early exit', async () => {
  for (const resultLimit of [3, 12, 30, 35]) {
    const fixtures = Array.from({ length: 90 }, (_, i) => place(i, 'DRAFT', `제주 ${String(i).padStart(3, '0')}`));
    const h = library(fixtures);
    assert.deepEqual((await h.api.searchAdminPlacesByName(h.db, '제주', { hidden: false, limit: resultLimit })).map((p) => p.id),
      fixtures.slice(0, resultLimit).map((p) => p.id));
    assert.equal(h.queries.length, Math.ceil(resultLimit / 30));
    assert.ok(h.queries.every((q) => q.find((p) => p.kind === 'limit')?.value === 30));
  }
});

test('snapshot pagination preserves equal-name documents and uses the last unfiltered document', async () => {
  const fixtures = Array.from({ length: 70 }, (_, i) => place(100 + i, i % 10 === 1 ? 'DRAFT' : 'HIDDEN', '제주 동명'));
  const h = library([...fixtures].reverse());
  const found = await h.api.searchAdminPlacesByName(h.db, '제주', { hidden: false });
  assert.deepEqual(found.map((p) => p.id), fixtures.filter((p) => p.data.publicationStatus === 'DRAFT').map((p) => p.id));
  assert.deepEqual(h.pages.map((page) => page.length), [30, 30, 10]);
  assert.deepEqual(h.queries.slice(1).map((q) => q.find((p) => p.kind === 'startAfter')?.value.id), ['kto-129', 'kto-159']);
  assert.equal(new Set(found.map((p) => p.id)).size, found.length);
});

test('filtered name query stops on short or empty pages and keeps every page inside the prefix', async () => {
  for (const count of [0, 29, 30, 31]) {
    const fixtures = Array.from({ length: count }, (_, i) => place(i, i === 0 ? 'DRAFT' : 'HIDDEN', `제주 ${String(i).padStart(3, '0')}`));
    const h = library([place(100, 'DRAFT', '서울'), ...fixtures, place(101, 'DRAFT', '한림')]);
    const found = await h.api.searchAdminPlacesByName(h.db, '제주', { hidden: false });
    assert.deepEqual(found.map((p) => p.id), count ? ['kto-0'] : []);
    assert.deepEqual(h.pages.map((page) => page.length), count < 30 ? [count] : [30, count - 30]);
    assert.ok(h.queries.every((q) => q.find((p) => p.kind === 'endAt')?.value === '제주\uf8ff'));
  }
});

test('filtered name query never reads beyond four 30-document pages, even with too few matches', async () => {
  for (const hidden of [false, true]) for (const partial of [false, true]) {
    const fixtures = Array.from({ length: 150 }, (_, i) => place(i,
      i >= 120 || (partial && i % 30 === 1) ? (hidden ? 'HIDDEN' : 'PUBLISHED') : hidden ? 'DRAFT' : 'HIDDEN',
      `제주 ${String(i).padStart(3, '0')}`));
    const h = library(fixtures);
    const found = await h.api.searchAdminPlacesByName(h.db, '제주', { hidden });
    assert.deepEqual(found.map((p) => p.id), partial ? ['kto-1', 'kto-31', 'kto-61', 'kto-91'] : []);
    assert.deepEqual(h.pages.map((page) => page.length), [30, 30, 30, 30]);
  }
  const h = library(Array.from({ length: 150 }, (_, i) => place(i)));
  assert.equal((await h.api.searchAdminPlacesByName(h.db, '제주', { hidden: false, limit: 121 })).length, 120);
  assert.deepEqual(h.pages.map((page) => page.length), [30, 30, 30, 30]);
});

test('omitting the hidden filter preserves exactly one read with the requested limit and all statuses', async () => {
  const fixtures = Array.from({ length: 150 }, (_, i) => place(i, ['DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED'][i % 4], `제주 ${String(i).padStart(3, '0')}`));
  for (const options of [undefined, { hidden: undefined }, { limit: 2 }, { limit: 40 }]) {
    const h = library(fixtures);
    const resultLimit = options?.limit ?? 12;
    assert.deepEqual((await h.api.searchAdminPlacesByName(h.db, '제주', options)).map((p) => p.id), fixtures.slice(0, resultLimit).map((p) => p.id));
    assert.equal(h.queries.length, 1);
    assert.equal(h.queries[0].find((p) => p.kind === 'limit')?.value, resultLimit);
    assert.equal(h.queries[0].some((p) => p.kind === 'startAfter'), false);
  }
});

test('name input only reads on button/Enter; repeats, empty results and focus reuse cache; explicit retry reloads', async () => {
  const h = await manager();
  await h.click('업체명 조회'); await h.enter(); await h.type('   '); await h.enter();
  assert.equal(h.calls.names.length, 0); assert.equal(h.button('조회').props.disabled, true);
  await h.type('제'); await h.type('제주'); await h.enter(true);
  assert.equal(h.calls.names.length, 0);
  await h.enter(); assert.equal(h.calls.names.length, 1); assert.match(h.content(), /표시 2개/);
  await h.click('조회'); await h.type(' 제주 '); await h.enter();
  assert.equal(h.calls.names.length, 1);
  h.window.dispatchEvent(new Event('focus')); h.window.dispatchEvent(new Event('visibilitychange')); await h.flush();
  assert.equal(h.calls.names.length, 1);
  await h.click('다시 조회'); assert.equal(h.calls.names.length, 2);
  await h.type('없음'); await h.enter(); await h.click('조회');
  assert.equal(h.calls.names.length, 3); assert.match(h.content(), /조건에 맞는 장소가 없습니다/);
  assert.equal(h.calls.regions.length, 0); h.unmount();
});

test('mode/status/input changes clear selections and dialogs; state caches remain separate', async () => {
  const h = await manager();
  await h.click('업체명 조회'); await h.type('제주'); await h.click('조회');
  await h.click('현재 표시된 항목 선택'); await h.click('선택 장소 삭제');
  assert.ok(h.all().some((el) => el.props.role === 'dialog'));
  await h.click('삭제된 장소');
  assert.match(h.content(), /선택 0개 \/ 표시 0개/); assert.ok(!h.all().some((el) => el.props.role === 'dialog'));
  assert.equal(h.calls.names.length, 1);
  await h.click('조회'); assert.match(h.content(), /표시 1개/); assert.equal(h.calls.names[1][2].hidden, true);
  await h.check('제주 3'); await h.click('지역·업종 조회');
  assert.match(h.content(), /선택 0개/);
  await h.click('업체명 조회'); await h.click('정상 장소'); await h.click('조회');
  assert.equal(h.calls.names.length, 2); assert.match(h.content(), /표시 2개/);
  await h.check('제주 1'); await h.type('새 검색'); assert.match(h.content(), /선택 0개 \/ 표시 0개/);
  h.unmount();
});

test('name selection uses the existing hide/restore batches and invalidates displayed revisions and cache', async () => {
  const h = await manager();
  await h.click('업체명 조회'); await h.type('제주'); await h.click('조회');
  assert.ok(!h.all().some((el) => el.type === 'button' && textOf(el) === '현재 조건 전체 선택'));
  await h.click('현재 표시된 항목 선택'); assert.match(h.content(), /선택 2개/); assert.equal(h.calls.regions.length, 0);
  await h.click('전체 선택 해제'); assert.match(h.content(), /선택 0개/);
  await h.edit('제주 1'); assert.equal(h.calls.editing, 'kto-1');
  await h.check('제주 1'); await h.check('제주 2'); await h.click('선택 장소 삭제');
  assert.equal(h.calls.batches.length, 0);
  const beforeHide = h.calls.clears;
  await h.click('확인하고 삭제');
  assert.ok(h.calls.clears > beforeHide); assert.equal(h.calls.editing, null);
  assert.deepEqual(h.calls.batches[0].targets.map((p) => p.id), ['kto-1', 'kto-2']);
  assert.equal(h.calls.invalidations, 1); assert.match(h.content(), /선택 0개 \/ 표시 0개/); assert.match(h.content(), /저장 완료: 2/);
  assert.equal(h.calls.names.length, 1); // invalidation clears; it does not auto-read
  await h.click('조회'); assert.equal(h.calls.names.length, 2); assert.match(h.content(), /조건에 맞는 장소가 없습니다/);
  await h.click('삭제된 장소'); await h.click('조회');
  await h.edit('제주 1'); assert.equal(h.calls.editing, 'kto-1');
  const beforeRestore = h.calls.clears;
  await h.check('제주 1'); await h.check('제주 2'); await h.click('선택 장소 복원'); await h.click('확인하고 복원');
  assert.ok(h.calls.clears > beforeRestore); assert.equal(h.calls.editing, null);
  assert.equal(h.calls.batches[1].action, 'restore'); assert.equal(h.calls.invalidations, 2);
  assert.equal(h.docs.get('kto-1')!.data.publicationStatus, 'DRAFT');
  assert.equal(h.docs.get('kto-2')!.data.publicationStatus, 'PUBLISHED');
  assert.equal(h.docs.get('kto-3')!.data.publicationStatus, 'HIDDEN'); h.unmount();
});

test('late name responses cannot repopulate switched modes, statuses or invalidated results', async () => {
  for (const fail of [false, true]) for (const transition of ['mode', 'status', 'invalidation']) {
    const old = deferred<CatalogDocument[]>();
    let count = 0;
    const h = await manager({ name: () => ++count === 1 ? old.promise : Promise.resolve([place(9)]) });
    await h.click('업체명 조회'); await h.type('제주'); await h.click('조회');
    if (transition === 'mode') await h.click('지역·업종 조회');
    else if (transition === 'status') await h.click('삭제된 장소');
    else { h.window.dispatchEvent(new Event(PLACE_DATA_CHANGED)); await h.flush(); await h.click('조회'); }
    if (fail) old.reject(new Error('late failure')); else old.resolve([place(1)]);
    await h.flush();
    assert.doesNotMatch(h.content(), /제주 1/);
    assert.doesNotMatch(h.content(), /late failure/);
    if (transition === 'invalidation') { await h.click('조회'); assert.equal(count, 2); assert.match(h.content(), /제주 9/); }
    h.unmount();
  }
});

test('pending identical queries share a read across mode switches, and failures can be retried', async () => {
  const pending = deferred<CatalogDocument[]>();
  const h = await manager({ name: () => pending.promise });
  await h.click('업체명 조회'); await h.type('제주'); await h.click('조회');
  await h.click('지역·업종 조회'); await h.click('업체명 조회'); await h.click('조회');
  assert.equal(h.calls.names.length, 1); pending.resolve([place(1)]); await h.flush(); assert.match(h.content(), /표시 1개/); h.unmount();
  let fail = true;
  const retry = await manager({ name: async () => { if (fail) throw new Error('offline'); return [place(1)]; } });
  await retry.click('업체명 조회'); await retry.type('제주'); await retry.click('조회'); assert.match(retry.content(), /offline/);
  fail = false; await retry.click('조회'); assert.equal(retry.calls.names.length, 2); assert.match(retry.content(), /표시 1개/); retry.unmount();
});

test('region pagination/select-all and edit links still work; name mode never fetches region pages', async () => {
  const h = await manager({ region: async (_db, _filter, cursor) => ({ places: [place(cursor ? 11 : 10)], cursor: 'next', hasMore: !cursor }) });
  assert.equal(h.button('지역·업종 조회').props['aria-pressed'], true);
  await h.select('관리 지역', 'WEST'); assert.equal(h.calls.regions.length, 0);
  await h.select('관리 업종', 'CAFE'); assert.equal(h.calls.regions.length, 1);
  await h.click('현재 표시된 항목 선택'); assert.match(h.content(), /선택 1개 \/ 표시 1개/);
  await h.edit('제주 10'); assert.equal(h.calls.editing, 'kto-10');
  await h.click('더 보기'); assert.match(h.content(), /표시 2개/); assert.equal(h.calls.regions.length, 2);
  assert.equal(h.calls.editing, 'kto-10');
  await h.click('다시 조회'); await h.click('현재 조건 전체 선택'); assert.match(h.content(), /선택 2개 \/ 표시 2개/);
  assert.equal(h.calls.editing, null);
  await h.click('업체명 조회'); await h.type('제주'); await h.click('조회');
  const before = h.calls.regions.length;
  assert.ok(!h.all().some((el) => el.type === 'button' && textOf(el) === '현재 조건 전체 선택'));
  await h.click('현재 표시된 항목 선택'); assert.equal(h.calls.regions.length, before);
  assert.ok(!h.all().some((el) => el.type === 'button' && textOf(el) === '더 보기'));
  const edit = h.all().find((el) => el.type === 'button' && textOf(el).startsWith('제주 1주소'))!;
  assert.ok(edit); edit.props.onClick(); await h.flush(); assert.deepEqual(h.calls.edits, ['kto-10', 'kto-1']);
  assert.equal(h.calls.editing, 'kto-1'); h.unmount();
});

test('query changes and refresh clear the open editor until a current result is clicked', async () => {
  const h = await manager();
  await h.select('관리 지역', 'WEST'); await h.select('관리 업종', 'CAFE');
  for (const change of [
    () => h.select('관리 지역', 'EAST'),
    () => h.select('관리 업종', 'FOOD'),
    () => h.click('삭제된 장소'),
    () => h.click('정상 장소'),
    () => h.click('다시 조회'),
    async () => { h.window.dispatchEvent(new Event(PLACE_DATA_CHANGED)); await h.flush(); },
  ]) {
    await h.edit('제주 10'); assert.equal(h.calls.editing, 'kto-10');
    const before = h.calls.clears;
    await change(); assert.ok(h.calls.clears > before); assert.equal(h.calls.editing, null);
  }
  await h.edit('제주 10'); await h.click('업체명 조회'); assert.equal(h.calls.editing, null);
  await h.type('제주'); await h.click('조회');
  for (const label of ['조회', '다시 조회', '지역·업종 조회']) {
    await h.edit('제주 1'); assert.equal(h.calls.editing, 'kto-1');
    const before = h.calls.clears;
    await h.click(label); assert.ok(h.calls.clears > before); assert.equal(h.calls.editing, null);
  }
  await h.click('업체명 조회'); await h.click('조회'); await h.edit('제주 1');
  await h.type('없음'); assert.equal(h.calls.editing, null);
  await h.click('조회'); assert.match(h.content(), /조건에 맞는 장소가 없습니다/); assert.equal(h.calls.editing, null);
  await h.type('제주'); await h.click('조회'); await h.edit('제주 1');
  const reads = h.calls.names.length, clears = h.calls.clears;
  h.window.dispatchEvent(new Event('focus')); h.window.dispatchEvent(new Event('visibilitychange')); await h.flush();
  assert.equal(h.calls.editing, 'kto-1'); assert.equal(h.calls.clears, clears); assert.equal(h.calls.names.length, reads);
  h.window.dispatchEvent(new Event(PLACE_DATA_CHANGED)); await h.flush();
  assert.equal(h.calls.editing, null); assert.equal(h.calls.names.length, reads);
  await h.click('조회'); assert.equal(h.calls.names.length, reads + 1); assert.equal(h.calls.editing, null);
  await h.edit('제주 1'); assert.equal(h.calls.editing, 'kto-1'); h.unmount();
});

test('new queries clear details immediately and empty name/region results keep them closed', async () => {
  for (const mode of ['name', 'region']) {
    const pending = deferred<any>();
    let count = 0;
    const h = await manager(mode === 'name'
      ? { name: () => ++count === 1 ? Promise.resolve([place(1)]) : pending.promise }
      : { region: () => ++count === 1 ? Promise.resolve({ places: [place(1)], cursor: null, hasMore: false }) : pending.promise });
    if (mode === 'name') { await h.click('업체명 조회'); await h.type('제주'); await h.click('조회'); }
    else { await h.select('관리 지역', 'WEST'); await h.select('관리 업종', 'CAFE'); }
    await h.edit('제주 1'); assert.equal(h.calls.editing, 'kto-1');
    await h.click('다시 조회'); assert.equal(h.calls.editing, null);
    pending.resolve(mode === 'name' ? [] : { places: [], cursor: null, hasMore: false });
    await h.flush(); assert.match(h.content(), /조건에 맞는 장소가 없습니다/); assert.equal(h.calls.editing, null);
    h.unmount();
  }
});

test('manager clear callback resets the real editor and stays stable when details reopen', async () => {
  const h = await editor(async () => loadedPlace());
  const clear = h.managerProps().onClearEdit;
  assert.equal(typeof clear, 'function');
  h.managerProps().onEdit('kto-1'); await h.flush(); assert.equal(h.hasDetails(), true);
  const field = h.all().find((el) => el.type === 'input' && el.props.type === 'checkbox')!;
  field.props.onChange(); await h.flush(); assert.equal(h.button('변경 확인').props.disabled, false);
  assert.equal(h.managerProps().onClearEdit, clear);
  clear(); await h.flush(); assert.equal(h.hasDetails(), false);
  h.managerProps().onEdit('kto-1'); await h.flush(); assert.equal(h.hasDetails(), true);
  assert.equal(h.button('변경 확인').props.disabled, true);
  assert.equal(h.managerProps().onClearEdit, clear); h.unmount();
});

test('clearing a pending detail load prevents its late success or error from reopening stale details', async () => {
  for (const fail of [false, true]) {
    const pending = deferred<ReturnType<typeof loadedPlace>>();
    let count = 0;
    const h = await editor(() => ++count === 1 ? pending.promise : Promise.resolve(loadedPlace(2)));
    h.managerProps().onEdit('kto-1'); await h.flush();
    h.managerProps().onClearEdit(); await h.flush();
    if (fail) pending.reject(new Error('stale detail failure')); else pending.resolve(loadedPlace());
    await h.flush();
    assert.equal(h.hasDetails(), false);
    assert.ok(!h.all().some((el) => el.props.role === 'status' && textOf(el).includes('stale detail failure')));
    h.managerProps().onEdit('kto-2'); await h.flush(); assert.equal(h.hasDetails(), true);
    h.unmount();
  }
});

test('saving cannot reopen details cleared by the list refresh; other saves still reload', async () => {
  for (const clearOnRefresh of [false, true]) {
    let loads = 0;
    const h = await editor(async () => { loads++; return loadedPlace(); });
    if (clearOnRefresh) h.onInvalidation(() => h.managerProps().onClearEdit());
    h.managerProps().onEdit('kto-1'); await h.flush(); await h.prepareEdit();
    h.button('확인하고 저장').props.onClick(); await h.flush();
    assert.equal(h.hasDetails(), !clearOnRefresh);
    assert.equal(loads, clearOnRefresh ? 1 : 2);
    h.unmount();
  }
});

test('a query change during the post-save detail reload keeps the editor closed', async () => {
  const pending = deferred<ReturnType<typeof loadedPlace>>();
  let loads = 0;
  const h = await editor(() => ++loads === 1 ? Promise.resolve(loadedPlace()) : pending.promise);
  h.managerProps().onEdit('kto-1'); await h.flush(); await h.prepareEdit();
  h.button('확인하고 저장').props.onClick(); await h.flush(); assert.equal(loads, 2);
  h.managerProps().onClearEdit(); await h.flush();
  pending.resolve(loadedPlace()); await h.flush(); assert.equal(h.hasDetails(), false);
  h.unmount();
});
