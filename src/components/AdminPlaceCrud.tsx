import { useEffect, useRef, useState, type ComponentType } from 'react';
import { db } from '../lib/firebase';
import { objectValue } from '../lib/effectivePlace';
import { ownerPlaceIdentity } from '../lib/placeIdentity';
import { invalidatePlaceQueries } from '../lib/placeInvalidation';
import type { CatalogDocument } from '../lib/placeAdapter';
import {
  ADMIN_FIELD_DEFINITIONS, batchHideAdminPlaces, batchRestoreAdminPlaces, buildAdminCreatePlan, createAdminPlace,
  formatAdminValue, searchAdminPlacesByRegionAndCategory, type AdminCreatePlan, type AdminFieldDefinition,
  type AdminRegionFilter, type AdminRegionPage, type PublicationAction, type PublicationResult,
} from '../lib/adminPlaceEditor';

export const CRUD_REGIONS = [['JEJU_CITY', '제주시'], ['SEOGWIPO_CITY', '서귀포시'], ['EAST', '동부'], ['WEST', '서부']];
export const CRUD_CATEGORIES = [['ATTRACTION', '관광지'], ['CAFE', '카페'], ['FOOD', '음식점'], ['SHOPPING', '쇼핑'], ['STAY', '숙박'], ['LEISURE', '레포츠'], ['CULTURE', '문화시설'], ['EVENT', '축제·공연·행사']];
const button = 'cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-xs transition duration-150 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900 active:scale-[0.98] active:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100';
const toggleButton = 'cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-xs transition duration-150 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900 active:scale-[0.98] active:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 aria-pressed:border-slate-900 aria-pressed:bg-slate-900 aria-pressed:text-white aria-pressed:shadow-sm aria-pressed:hover:border-slate-800 aria-pressed:hover:bg-slate-800 aria-pressed:hover:text-white';
const selectButton = 'cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-amber-500 disabled:cursor-not-allowed disabled:opacity-40';
const statusLabels: Record<PublicationResult['kind'], string> = {
  committed: '저장 완료', already: '이미 처리됨', confirmed: '현재 상태 확인됨', conflict: '충돌 — 다시 확인 필요',
  missing: '찾을 수 없음', unrestorable: '복원 근거 없음', failed: '실패', uncertain: '확인 필요', unattempted: '미시도',
};
const messageOf = (error: unknown) => error instanceof Error ? error.message : '처리하지 못했습니다. 다시 확인해 주세요.';

export function AdminCreatePlace({ uid, Input, onClose, onCreated, onBusyChange }: {
  uid: string;
  Input: ComponentType<{ definition: AdminFieldDefinition; value: string; disabled: boolean; onChange: (value: string) => void }>;
  onClose: () => void;
  onCreated: (id: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [uuid] = useState(() => ownerPlaceIdentity().uuid);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<AdminCreatePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  async function prepare() {
    setBusy(true); setError('');
    try { setPlan(await buildAdminCreatePlan(drafts, uuid)); }
    catch (error) { setError(messageOf(error)); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!db || !plan || busy) return;
    setBusy(true); setError('');
    try {
      await createAdminPlace(db, plan, uid);
      invalidatePlaceQueries();
      onCreated(plan.place.id);
    } catch (error) { setError(`${messageOf(error)} 같은 등록 요청으로 다시 확인·저장할 수 있습니다.`); }
    finally { setBusy(false); }
  }
  return <section className="mt-4 space-y-4 rounded-2xl border border-amber-200 bg-white p-4">
    <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-2 flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-white/95 px-4 py-3 backdrop-blur-sm">
      <div>
        <h3 className="font-black text-slate-900">새 장소 등록</h3>
        <p className="mt-0.5 text-xs text-slate-500">장소명·검색 권역·장소유형은 필수입니다. 나머지는 아는 정보만 입력해 주세요. 등록하면 일반 화면에 공개됩니다.</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="cursor-pointer rounded-xl border border-amber-500 bg-amber-500 px-3 py-2 text-sm font-bold text-white shadow-sm transition duration-150 hover:bg-amber-600 active:scale-[0.98] active:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
          disabled={busy || !!plan}
          onClick={() => void prepare()}
        >
          {busy ? '처리 중…' : '등록 내용 확인'}
        </button>
        <button type="button" className={button} disabled={busy} onClick={onClose}>닫기</button>
      </div>
    </div>
    {[...new Set(ADMIN_FIELD_DEFINITIONS.map(({ group }) => group))].map((group) => <fieldset key={group} className="rounded-xl border p-3">
      <legend className="px-1 text-sm font-bold">{group}</legend><div className="grid gap-3 md:grid-cols-2">
        {ADMIN_FIELD_DEFINITIONS.filter((d) => d.group === group).map((definition) => <label key={definition.id} className="block text-xs font-bold">
          <span className="mb-1 block">{definition.label}{['name', 'serviceCategory', 'regionArea'].includes(definition.id) ? ' *' : ''}</span>
          <Input definition={definition} value={drafts[definition.id] ?? (definition.kind === 'triState' ? 'UNKNOWN' : '')} disabled={busy || !!plan} onChange={(value) => setDrafts((current) => ({ ...current, [definition.id]: value }))} />
        </label>)}
      </div></fieldset>)}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" className={button} disabled={busy} onClick={onClose}>닫기</button>
      <button
        type="button"
        className="cursor-pointer rounded-xl border border-amber-500 bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition duration-150 hover:bg-amber-600 active:scale-[0.98] active:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
        disabled={busy || !!plan}
        onClick={() => void prepare()}
      >
        {busy ? '처리 중…' : '등록 내용 확인'}
      </button>
    </div>
    {plan && <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-slate-900/60 p-4"><section role="dialog" aria-modal="true" aria-labelledby="create-title" className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5">
      <h3 id="create-title" className="font-black">새 장소 등록 확인</h3><ul className="my-4 space-y-2">{plan.inputs.map(({ label, value }) => <li key={label} className="break-words text-sm"><strong>{label}: </strong>{formatAdminValue(value)}</li>)}</ul>
      {error && <p role="alert" className="my-3 text-sm text-rose-800">{error}</p>}
      <div className="flex justify-end gap-2"><button className={button} disabled={busy} onClick={() => setPlan(null)}>돌아가기</button><button className={button} disabled={busy} onClick={() => void save()}>{busy ? '등록 중…' : '확인하고 등록'}</button></div>
    </section></div>}
  </section>;
}

export function AdminRegionManager({ onEdit, onBusyChange }: { onEdit: (id: string) => void; onBusyChange: (busy: boolean) => void }) {
  const [filter, setFilter] = useState<AdminRegionFilter>({ region: 'UNKNOWN', category: 'UNKNOWN', hidden: false });
  const [page, setPage] = useState<AdminRegionPage>({ places: [], cursor: null, hasMore: false });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [confirmation, setConfirmation] = useState<{ action: PublicationAction; targets: CatalogDocument[] } | null>(null);
  const [outcomes, setOutcomes] = useState<PublicationResult[]>([]);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const ticket = ++generation.current;
    setSelected(new Set()); setConfirmation(null); setError('');
    setPage({ places: [], cursor: null, hasMore: false });
    if (!db || filter.region === 'UNKNOWN' || filter.category === 'UNKNOWN') { setBusy(false); return; }
    setBusy(true);
    void searchAdminPlacesByRegionAndCategory(db, filter).then((next) => {
      if (ticket === generation.current) setPage(next);
    }, (error) => { if (ticket === generation.current) setError(messageOf(error)); })
      .finally(() => { if (ticket === generation.current) setBusy(false); });
    return () => { generation.current++; };
  }, [filter, attempt]);
  // An edit/create elsewhere in the administrator screen invalidates selected revisions.
  useEffect(() => {
    const refresh = () => setAttempt((value) => value + 1);
    window.addEventListener('dangjeju:places-changed', refresh);
    return () => window.removeEventListener('dangjeju:places-changed', refresh);
  }, []);

  async function more(selectAll = false) {
    if (!db || busy) return;
    const ticket = generation.current;
    setBusy(true); setError('');
    try {
      let next = page;
      const docs = new Map(page.places.map((place) => [place.id, place]));
      while (next.hasMore) {
        next = await searchAdminPlacesByRegionAndCategory(db, filter, next.cursor);
        if (ticket !== generation.current) return;
        next.places.forEach((place) => docs.set(place.id, place));
        if (!selectAll) break;
      }
      setPage({ ...next, places: [...docs.values()] });
      if (selectAll) setSelected(new Set(docs.keys()));
    } catch (error) { if (ticket === generation.current) setError(`전체 조회·선택이 완료되지 않았습니다. ${messageOf(error)}`); }
    finally { if (ticket === generation.current) setBusy(false); }
  }
  async function execute() {
    if (!db || !confirmation || busy) return;
    setBusy(true); setError(''); setOutcomes([]);
    controller.current = new AbortController();
    try {
      const work = confirmation.action === 'hide' ? batchHideAdminPlaces : batchRestoreAdminPlaces;
      const result = await work(db, confirmation.targets, { signal: controller.current.signal, onProgress: setOutcomes });
      setOutcomes(result); setConfirmation(null); setSelected(new Set());
      invalidatePlaceQueries();
    } catch (error) { setError(messageOf(error)); }
    finally { controller.current = null; setBusy(false); }
  }
  const targets = page.places.filter(({ id }) => selected.has(id));
  const labelFor = (options: string[][], value: unknown) => options.find(([key]) => key === value)?.[1] ?? String(value);
  return <section className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap gap-2" role="group" aria-label="장소 상태">
      {[false, true].map((hidden) => <button key={String(hidden)} className={toggleButton} aria-pressed={filter.hidden === hidden} disabled={!!controller.current} onClick={() => setFilter((current) => ({ ...current, hidden }))}>{hidden ? '삭제된 장소' : '정상 장소'}</button>)}
    </div>
    <div className="flex flex-wrap gap-2">
      <label className="text-sm">지역 <select aria-label="관리 지역" className={selectButton} disabled={!!controller.current} value={filter.region} onChange={(e) => setFilter((f) => ({ ...f, region: e.target.value as AdminRegionFilter['region'] }))}><option value="UNKNOWN">지역 선택</option>{CRUD_REGIONS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="text-sm">업종 <select aria-label="관리 업종" className={selectButton} disabled={!!controller.current} value={filter.category} onChange={(e) => setFilter((f) => ({ ...f, category: e.target.value as AdminRegionFilter['category'] }))}><option value="UNKNOWN">업종 선택</option>{CRUD_CATEGORIES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <button className={button} disabled={busy} onClick={() => setAttempt((v) => v + 1)}>다시 조회</button>
    </div>
    <p className="text-xs text-slate-500">지역과 업종을 모두 선택해 주세요. 선택 대상은 조회된 목록 기준이며, 저장 전 변경 여부를 다시 확인합니다.</p>
    <div className="flex flex-wrap items-center gap-2">
      <button className={button} disabled={busy || !page.places.length} onClick={() => setSelected(new Set(page.places.map(({ id }) => id)))}>현재 표시된 항목 선택</button>
      <button className={button} disabled={busy || !page.places.length} onClick={() => void more(true)}>현재 조건 전체 선택</button>
      <button className={button} disabled={busy} onClick={() => setSelected(new Set())}>전체 선택 해제</button>
      <span aria-live="polite" className="text-sm font-bold">선택 {selected.size}개 / 표시 {page.places.length}개</span>
      <button className={button} disabled={busy || !targets.length} onClick={() => setConfirmation({ action: filter.hidden ? 'restore' : 'hide', targets: [...targets] })}>{filter.hidden ? '선택 장소 복원' : '선택 장소 삭제'}</button>
    </div>
    {busy && <p role="status">처리 중…</p>}{error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
    {!busy && !page.places.length && filter.region !== 'UNKNOWN' && filter.category !== 'UNKNOWN' && !error && <p className="text-sm">조건에 맞는 장소가 없습니다.</p>}
    <ul className="divide-y rounded-xl border">{page.places.map((place) => <li key={place.id} className="flex items-center gap-3 p-3">
      <input type="checkbox" aria-label={`${String(place.data.name)} 선택`} disabled={busy} checked={selected.has(place.id)} onChange={() => setSelected((old) => { const next = new Set(old); if (next.has(place.id)) next.delete(place.id); else next.add(place.id); return next; })} />
      <button disabled={busy} className="min-w-0 flex-1 cursor-pointer text-left transition duration-150 hover:opacity-80 active:scale-[0.99] disabled:cursor-not-allowed" onClick={() => onEdit(place.id)}><strong className="block break-words text-sm">{String(place.data.name)}</strong><span className="text-xs text-slate-500">{String(place.data.address ?? '주소 미확인')} · {filter.hidden ? '삭제됨' : '정상'}</span></button>
    </li>)}</ul>
    {page.hasMore && <button className={button} disabled={busy} onClick={() => void more()}>더 보기</button>}
    {outcomes.length > 0 && <div role="status" className="rounded-xl bg-slate-50 p-3">
      <p className="text-sm font-bold">처리 결과 {outcomes.length}개</p><div className="my-2 flex flex-wrap gap-3 text-xs">{Object.entries(statusLabels).map(([kind, label]) => <span key={kind}>{label}: {outcomes.filter((r) => r.kind === kind).length}</span>)}</div>
      <details><summary className="cursor-pointer text-sm">장소별 결과 보기</summary><ul className="max-h-64 overflow-auto text-xs">{outcomes.map((r) => <li key={r.id} className="py-1">{r.name} — {statusLabels[r.kind]} {r.reason ?? ''}</li>)}</ul></details>
      <p className="mt-2 text-xs">실패·충돌·확인 필요 항목은 다시 조회하고 현재 상태를 확인한 뒤 선택해 주세요.</p>
    </div>}
    {confirmation && <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-slate-900/60 p-4"><section role="dialog" aria-modal="true" aria-labelledby="bulk-title" className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5">
      <h3 id="bulk-title" className="font-black">선택한 {confirmation.targets.length}개 장소를 {confirmation.action === 'hide' ? '삭제 처리' : '복원'}하시겠습니까?</h3>
      <p className="mt-2 text-sm">실제 데이터는 삭제되지 않으며 관리자 화면에서 복원할 수 있습니다. 일부 항목만 처리될 수 있으므로 완료 후 장소별 결과를 확인해 주세요.</p>
      {confirmation.action === 'restore' && <p className="mt-2 text-sm">DRAFT {confirmation.targets.filter((p) => objectValue(p.data.manualAdmin).previousPublicationStatus === 'DRAFT').length}개 · PUBLISHED {confirmation.targets.filter((p) => objectValue(p.data.manualAdmin).previousPublicationStatus === 'PUBLISHED').length}개 · 복원 근거 없음 {confirmation.targets.filter((p) => !['DRAFT', 'PUBLISHED'].includes(String(objectValue(p.data.manualAdmin).previousPublicationStatus))).length}개</p>}
      <ul className="my-4 max-h-64 overflow-auto text-sm">{confirmation.targets.map((p) => <li key={p.id} className="py-1">{String(p.data.name)} · {labelFor(CRUD_REGIONS, objectValue(p.data.search).region)} · {labelFor(CRUD_CATEGORIES, objectValue(p.data.search).category)}</li>)}</ul>
      {error && <p role="alert">{error}</p>}
      <div className="flex justify-end gap-2"><button className={button} disabled={busy} onClick={() => setConfirmation(null)}>돌아가기</button><button className={button} disabled={busy} onClick={() => void execute()}>확인하고 {confirmation.action === 'hide' ? '삭제' : '복원'}</button>{busy && <button className={button} onClick={() => controller.current?.abort()}>다음 처리부터 중단</button>}</div>
    </section></div>}
  </section>;
}
