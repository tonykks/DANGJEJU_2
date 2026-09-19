import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, ImageOff, Search, ShieldCheck } from 'lucide-react';
import { db } from '../lib/firebase';
import { adaptPlace, adaptPlaceDocs, PLACEHOLDER_IMAGE } from '../lib/placeAdapter';
import {
  ADMIN_FIELD_DEFINITIONS,
  ADMIN_PLACE_QUERY_LIMIT,
  adminFieldCurrentValue,
  adminValueToDraft,
  buildAdminEditPlan,
  formatAdminValue,
  loadAdminPlace,
  saveAdminPlace,
  searchAdminPlacesByName,
  type AdminEditPlan,
  type AdminFieldDefinition,
  type AdminFieldGroup,
  type AdminLoadedPlace,
} from '../lib/adminPlaceEditor';

const GROUPS: AdminFieldGroup[] = ['기본 정보', '위치·연락처', '이미지·운영', '반려동물 상태·정책', '반려동물 상세', '편의시설', '추천·주의'];
const CATEGORY_OPTIONS = [
  ['ATTRACTION', '관광지'], ['CAFE', '카페'], ['FOOD', '음식점'], ['SHOPPING', '쇼핑'],
  ['STAY', '숙박'], ['LEISURE', '레포츠'], ['CULTURE', '문화시설'], ['EVENT', '축제·공연·행사'],
];
const REGION_OPTIONS = [['JEJU_CITY', '제주시'], ['SEOGWIPO_CITY', '서귀포시'], ['EAST', '동부'], ['WEST', '서부']];
const TRI_OPTIONS = [['TRUE', '예/가능'], ['FALSE', '아니요/불가'], ['UNKNOWN', '미확인']];
const REQUIRED_OPTIONS = [['TRUE', '필수'], ['FALSE', '필수 아님'], ['UNKNOWN', '미확인']];

type Props = { uid: string; onHome: () => void };

function EditorInput({ definition, value, disabled, onChange }: { definition: AdminFieldDefinition; value: string; disabled: boolean; onChange: (value: string) => void }) {
  const common = { value, disabled, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(event.target.value), className: 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-500 disabled:bg-slate-100 disabled:text-slate-400' };
  const options = definition.kind === 'category' ? CATEGORY_OPTIONS
    : definition.kind === 'region' ? REGION_OPTIONS
      : definition.kind === 'triState' && ['carrierRequired', 'leashRequired'].includes(definition.key) ? REQUIRED_OPTIONS
        : definition.kind === 'triState' ? TRI_OPTIONS
          : null;
  if (options) return <select {...common}>{options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>;
  if (definition.kind === 'textarea' || definition.kind === 'list') return <textarea {...common} rows={definition.kind === 'list' ? 3 : 4} placeholder={definition.placeholder ?? (definition.kind === 'list' ? '한 줄에 하나씩 입력' : undefined)} />;
  return <input {...common} type={definition.kind === 'number' ? 'number' : definition.kind === 'url' ? 'url' : 'text'} step={definition.kind === 'number' ? 'any' : undefined} placeholder={definition.placeholder} />;
}

function PreviewImage({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const display = !failed && /^https?:\/\//i.test(src) ? src : PLACEHOLDER_IMAGE;
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 text-[11px] font-bold text-slate-500">{label}</figcaption>
      <div className="h-28 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        <img key={src} src={display} alt={`${label} 미리보기`} onError={() => setFailed(true)} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      </div>
      {display === PLACEHOLDER_IMAGE && <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400"><ImageOff className="h-3 w-3" />이미지 없음 또는 로드 실패</p>}
    </figure>
  );
}

export function AdminUnchangedSelectionNotice({ selections }: { selections: AdminEditPlan['unchangedSelections'] }) {
  if (!selections.length) return null;
  return (
    <div role="note" className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
      <p className="font-bold">현재 표시값과 같아 저장에서 제외된 선택 항목</p>
      <ul className="mt-1 list-disc pl-5 text-xs">
        {selections.map((selection) => <li key={selection.id}>{selection.label}: {formatAdminValue(selection.value)}</li>)}
      </ul>
    </div>
  );
}

export default function AdminPlaceEditor({ uid, onHome }: Props) {
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchAdminPlacesByName>>>([]);
  const [loaded, setLoaded] = useState<AdminLoadedPlace | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clears, setClears] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<AdminEditPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const selectedPlace = useMemo(() => loaded ? adaptPlace(loaded.place, [loaded.source]) : null, [loaded]);

  function initialize(next: AdminLoadedPlace) {
    setLoaded(next);
    setSelected(new Set());
    setClears(new Set());
    setPlan(null);
    setDrafts(Object.fromEntries(ADMIN_FIELD_DEFINITIONS.map((definition) => [definition.id, adminValueToDraft(adminFieldCurrentValue(definition, next))])));
  }

  function clearLoadedPlace() {
    setLoaded(null);
    setSelected(new Set());
    setClears(new Set());
    setDrafts({});
    setPlan(null);
  }

  async function runSearch(event: FormEvent) {
    event.preventDefault();
    if (!db || busy) return;
    setBusy(true); setMessage(null); setResults([]); clearLoadedPlace();
    try {
      const found = await searchAdminPlacesByName(db, queryText);
      setResults(found);
      setMessage(found.length ? `${found.length}개 결과를 찾았습니다.${found.length === ADMIN_PLACE_QUERY_LIMIT ? ' 접두검색 상한에 도달했습니다.' : ''}` : '일치하는 장소가 없습니다.');
    } catch (error) {
      setResults([]);
      setMessage(error instanceof Error ? error.message : '장소 검색에 실패했습니다.');
    } finally { setBusy(false); }
  }

  async function selectPlace(placeId: string) {
    if (!db || busy) return;
    setBusy(true); setMessage(null); clearLoadedPlace();
    try { initialize(await loadAdminPlace(db, placeId)); }
    catch (error) { setMessage(error instanceof Error ? error.message : '장소 정보를 불러오지 못했습니다.'); }
    finally { setBusy(false); }
  }

  function toggleField(id: string) {
    setPlan(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        setClears((values) => { const copy = new Set(values); copy.delete(id); return copy; });
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function prepareConfirmation() {
    if (!loaded) return;
    try {
      setPlan(buildAdminEditPlan(loaded, selected, drafts, clears, uid));
      setMessage(null);
    } catch (error) {
      setPlan(null);
      setMessage(error instanceof Error ? error.message : '입력값을 확인해 주세요.');
    }
  }

  async function save() {
    if (!db || !loaded || !plan || busy) return;
    setBusy(true); setMessage(null);
    try {
      await saveAdminPlace(db, loaded, plan, uid);
    } catch (error) {
      setMessage(error instanceof Error ? `저장하지 못했습니다. 선택한 항목은 반영되지 않았습니다: ${error.message}` : '저장하지 못했습니다. 선택한 항목은 반영되지 않았습니다.');
      setBusy(false);
      return;
    }

    const savedPlaceId = loaded.place.id;
    clearLoadedPlace();
    try {
      initialize(await loadAdminPlace(db, savedPlaceId));
      setMessage('선택한 표시정보와 검색 파생값을 한 번의 원자적 업데이트로 저장했습니다.');
    } catch {
      setMessage('저장은 완료됐지만 최신 값을 다시 불러오지 못했습니다. 장소를 다시 검색해 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-amber-600" /><h2 className="text-xl font-black text-slate-900">장소 정보 관리</h2></div>
          <p className="mt-1 text-xs text-slate-500">장소명 접두검색 → 장소 선택 → 수정 항목 선택 → 변경 확인 → 저장</p>
        </div>
        <button onClick={onHome} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><ArrowLeft className="h-4 w-4" />홈으로</button>
      </div>

      <section className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
        <form onSubmit={runSearch} className="flex gap-2">
          <label className="sr-only" htmlFor="admin-place-search">업체명 검색</label>
          <input id="admin-place-search" value={queryText} onChange={(event) => setQueryText(event.target.value)} maxLength={80} placeholder="업체명 접두어를 입력하세요" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-500" />
          <button disabled={busy} className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Search className="h-4 w-4" />검색</button>
        </form>
        <p className="mt-2 text-[11px] text-slate-500">비어 있거나 80자를 넘는 검색은 실행하지 않으며, Firestore `name` 접두검색 결과를 최대 {ADMIN_PLACE_QUERY_LIMIT}개만 읽습니다.</p>
        {results.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {adaptPlaceDocs(results).map((place) => (
              <li key={place.id}><button type="button" onClick={() => void selectPlace(place.id)} className="w-full px-3 py-3 text-left hover:bg-amber-50">
                <span className="block text-sm font-bold text-slate-900">{place.name}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{place.id} · {place.roadAddress || place.address || '주소 미확인'} · {place.category}</span>
              </button></li>
            ))}
          </ul>
        )}
      </section>

      {message && <div role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-slate-700">{message}</div>}

      {loaded && selectedPlace && (
        <section className="mt-5 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="font-black text-slate-900">{selectedPlace.name}</h3>
            <p className="mt-1 text-xs text-slate-500">{selectedPlace.id} · {selectedPlace.roadAddress || selectedPlace.address} · {selectedPlace.category}</p>
            <p className="mt-2 text-[11px] text-slate-400">내부 ID·search·점수·hash·시각·provenance는 표시용 수정 항목에 포함되지 않습니다.</p>
          </div>

          {GROUPS.map((group) => (
            <fieldset key={group} className="rounded-2xl border border-slate-200 bg-white p-4">
              <legend className="px-1 text-sm font-black text-slate-800">{group}</legend>
              <div className="mt-2 grid gap-3 lg:grid-cols-2">
                {ADMIN_FIELD_DEFINITIONS.filter((definition) => definition.group === group).map((definition) => {
                  const current = adminFieldCurrentValue(definition, loaded);
                  const editing = selected.has(definition.id);
                  const clearing = clears.has(definition.id);
                  const image = definition.key === 'primaryImageUrl' || definition.key === 'secondaryImageUrl';
                  return (
                    <div key={definition.id} className={`rounded-xl border p-3 ${editing ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'}`}>
                      <label className="flex items-start gap-2">
                        <input type="checkbox" checked={editing} onChange={() => toggleField(definition.id)} className="mt-0.5 h-4 w-4 accent-amber-600" />
                        <span className="min-w-0"><span className="block text-xs font-bold text-slate-800">{definition.label}</span><span className="mt-0.5 block break-words text-[11px] text-slate-500">현재: {formatAdminValue(current)}</span></span>
                      </label>
                      {editing && (
                        <div className="mt-3 space-y-2">
                          {definition.allowClear && <label className="flex items-center gap-2 text-[11px] font-bold text-rose-700"><input type="checkbox" checked={clearing} onChange={() => setClears((values) => { const next = new Set(values); if (next.has(definition.id)) next.delete(definition.id); else next.add(definition.id); setPlan(null); return next; })} className="accent-rose-600" />값 지우기 (입력란 공백과 구분)</label>}
                          <EditorInput definition={definition} value={drafts[definition.id] ?? ''} disabled={clearing} onChange={(value) => { setDrafts((values) => ({ ...values, [definition.id]: value })); setPlan(null); }} />
                          {image && <div className="grid grid-cols-2 gap-2"><PreviewImage src={String(current ?? '')} label="변경 전" /><PreviewImage src={clearing ? '' : drafts[definition.id] ?? ''} label="변경 후" /></div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <div className="sticky bottom-3 z-20 flex justify-end gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
            <button disabled={busy || selected.size === 0} onClick={prepareConfirmation} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50">변경 확인</button>
          </div>
        </section>
      )}

      {plan && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="admin-confirm-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
            <h3 id="admin-confirm-title" className="text-lg font-black text-slate-900">저장 전 변경 확인</h3>
            <p className="mt-1 text-xs text-slate-500">아래 표시 필드와 자동 파생·감사 필드를 revision 확인 transaction으로 함께 저장합니다.</p>
            <ul className="mt-4 space-y-2">
              {plan.changes.map((change) => <li key={change.id} className="rounded-xl border border-slate-200 p-3 text-sm"><strong>{change.label}</strong><div className="mt-1 grid grid-cols-[1fr_auto_1fr] gap-2 text-xs text-slate-600"><span className="break-words">{formatAdminValue(change.before)}</span><span>→</span><span className="break-words font-bold text-slate-900">{change.cleared ? '(명시적으로 지움)' : formatAdminValue(change.after)}</span></div></li>)}
            </ul>
            <AdminUnchangedSelectionNotice selections={plan.unchangedSelections} />
            {message && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{message}</div>}
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setPlan(null)} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">돌아가기</button><button onClick={() => void save()} disabled={busy} className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{busy ? '저장 중…' : '확인하고 저장'}</button></div>
          </section>
        </div>
      )}
    </main>
  );
}
