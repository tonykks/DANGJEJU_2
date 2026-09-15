import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adaptPlace, categoryFor, joinPlacesCatalog, PET_KNOWN_LABEL, PET_UNKNOWN_LABEL, PLACEHOLDER_IMAGE, regionFor, savedCatalogPlaces, type CatalogDocument } from '../src/lib/placeAdapter.ts';
import { loadCatalogWith } from '../src/lib/placesCatalog.ts';
import { createFavoritesSession } from '../src/lib/favoritesSession.ts';

function place(id = 'kto-3401751', extra: Record<string, unknown> = {}): CatalogDocument {
  return { id, path: `places/${id}`, data: { placeId: id, name: '제주 카페', address: '제주시 애월읍', municipality: 'JEJU_CITY', regionArea: 'UNKNOWN', serviceCategory: null, latitude: 33.4, longitude: 126.3, petPolicy: { petInformationStatus: 'UNKNOWN', indoorAllowed: 'UNKNOWN' }, ...extra } };
}
function source(id = 'kto-3401751', kto: Record<string, unknown> = {}): CatalogDocument {
  const sourceId = `kto-areaBasedList2-${id.slice(4)}`;
  return { id: sourceId, path: `places/${id}/sources/${sourceId}`, data: { placeId: id, source: 'KTO', kto: { contentTypeId: '39', cat3: 'A05020900', ...kto } } };
}

test('all imported content types map to Owner 8-kind UI categories; shopping/leisure cannot imply cafe', () => {
  assert.equal(categoryFor('12', 'A05020900', '반려동물 카페'), 'attraction');
  assert.equal(categoryFor('14', 'A05020900', '반려동물 카페'), 'culture');
  assert.equal(categoryFor('15', 'A05020900', '반려동물 카페'), 'event');
  assert.equal(categoryFor('28', 'A05020900', '반려동물 카페'), 'leisure');
  assert.equal(categoryFor('38', 'A05020900', '반려동물 카페'), 'shopping');
  assert.equal(categoryFor('32', null, '카페 스테이'), 'stay');
  assert.equal(categoryFor('new-type', null, '카페'), 'attraction');
});

test('food category uses authoritative cat3 before narrow title fallback', () => {
  assert.equal(categoryFor('39', 'A05020900', '제주 다원'), 'cafe');
  assert.equal(categoryFor('39', 'A05020100', '카페 옆 한식당'), 'food');
  for (const title of ['카페 봄', '제주 커피', '베이커리', '찻집', 'Jeju Cafe', 'Coffee House', 'Bakery']) assert.equal(categoryFor(39, null, title), 'cafe');
  for (const title of ['제주 식당', '흑돼지 전문점', '']) assert.equal(categoryFor(39, '', title), 'food');
});

test('all specified east/west districts take precedence over municipality without mutating DB classification', () => {
  for (const area of ['구좌', '조천', '성산', '표선']) assert.deepEqual(regionFor(`제주 ${area}읍`, 'JEJU_CITY'), { region: 'east', regionName: `동부 (${area})` });
  for (const area of ['애월', '한림', '한경', '안덕', '대정']) assert.equal(regionFor(area, 'SEOGWIPO_CITY').region, 'west');
  assert.equal(regionFor('제주시 연동', 'JEJU_CITY').region, 'jeju_city');
  assert.equal(regionFor('서귀포시 남원읍', 'SEOGWIPO_CITY').region, 'seogwipo');
  assert.equal(regionFor('', null).regionName, '지역 정보 미확인');
  const input = place(); const before = structuredClone(input); adaptPlace(input, [source()]); assert.deepEqual(input, before);
});

test('UNKNOWN never invents dog sizes, free admission, indoor/outdoor permission, or amenities', () => {
  const result = adaptPlace(place(), [source(undefined, { pet: { acmpyPsblCpam: '대형견 가능', relaFrnshPrdlst: '물그릇' } })]);
  assert.equal(result.petInformationStatus, 'UNKNOWN');
  assert.equal(result.petInformationLabel, PET_UNKNOWN_LABEL);
  assert.match(result.petInformationNotice!, /동반 불가를 의미하지 않/);
  assert.deepEqual(result.petDetails, []);
  assert.deepEqual(result.petPolicy.allowedSizes, []);
  assert.equal(result.petPolicy.spacePolicy, 'unknown');
  assert.equal(result.petPolicy.petFee, null);
  assert.equal(result.petPolicy.indoorAllowed, false);
  assert.equal(result.petPolicy.outdoorAllowed, false);
  assert.equal(result.amenities.waterBowlProvided, false);
});

test('known pet information retains provided keys as text, omitting blank/missing fields without inferring booleans', () => {
  const result = adaptPlace(place(undefined, { petPolicy: { petInformationStatus: 'KTO_OVERLAY_FOUND' } }), [source(undefined, { pet: { acmpyTypeCd: '부분동반', acmpyNeedMtr: '목줄 필수\n전화 문의', acmpyPsblCpam: '대형견', relaFrnshPrdlst: '물그릇', relaAcdntRiskMtr: '', invented: '무료' } })]);
  assert.equal(result.petInformationLabel, PET_KNOWN_LABEL);
  assert.deepEqual(result.petDetails?.map((d) => d.key), ['acmpyTypeCd', 'acmpyNeedMtr', 'acmpyPsblCpam', 'relaFrnshPrdlst']);
  assert.deepEqual(result.cautionNotes, ['동반 시 필요 사항: 목줄 필수\n전화 문의']);
  assert.equal(result.petPolicy.leashRequired, false);
  assert.equal(result.amenities.waterBowlProvided, false);
  assert.equal(result.petPolicy.petFee, null);
});

test('known status survives missing source text, without fabricating details', () => {
  const result = adaptPlace(place(undefined, { petPolicy: { petInformationStatus: 'KTO_OVERLAY_FOUND' } }));
  assert.equal(result.petInformationStatus, 'KTO_OVERLAY_FOUND');
  assert.deepEqual(result.petDetails, []);
});

test('photos use primary, secondary, same-place source, neutral placeholder; unsafe URLs ignored', () => {
  const result = adaptPlace(place(undefined, { primaryImageUrl: 'http://example.com/primary.jpg', secondaryImageUrl: 'https://example.com/secondary.jpg' }), [source(undefined, { firstImage: 'https://example.com/source.jpg' })]);
  assert.deepEqual(result.imageFallbackUrls, ['https://example.com/primary.jpg', 'https://example.com/secondary.jpg', 'https://example.com/source.jpg', PLACEHOLDER_IMAGE]);
  assert.equal(adaptPlace(place(undefined, { primaryImageUrl: null, secondaryImageUrl: 'https://example.com/secondary.jpg' })).imageUrl, 'https://example.com/secondary.jpg');
  assert.equal(adaptPlace(place(undefined, { primaryImageUrl: 'javascript:alert(1)' })).imageUrl, PLACEHOLDER_IMAGE);
});

test('map skips missing/out-of-range coordinates and retains the place in counts', () => {
  for (const coords of [{ latitude: null, longitude: null }, { latitude: '', longitude: ' ' }, { latitude: 33.4, longitude: 12.79737228191 }, { latitude: Infinity, longitude: 126.4 }, { latitude: 33.4, longitude: 126.4, coordinateQualityStatus: 'SOURCE_ANOMALY' }]) {
    const result = joinPlacesCatalog([place(undefined, coords)], []);
    assert.equal(result.places[0].coordinates, null);
    assert.equal(result.counts.places, 1);
    assert.equal(result.counts.mapped, 0);
  }
  assert.deepEqual(adaptPlace(place(undefined, { latitude: null, longitude: null }), [source(undefined, { mapy: 33.4, mapx: 126.4 })]).coordinates, { lat: 33.4, lng: 126.4 });
  assert.equal(adaptPlace(place(undefined, { longitude: 12.79737228191 }), [source(undefined, { mapx: 126.4 })]).coordinates, null);
});

test('bulk join preserves separate IDs with identical names and rejects unrelated source paths', () => {
  const a = place('kto-3371999'); const b = place('kto-4026831', { petPolicy: { petInformationStatus: 'KTO_OVERLAY_FOUND' } });
  const wrongParent = source(a.id); wrongParent.path = `private/elsewhere/sources/${wrongParent.id}`;
  const result = joinPlacesCatalog([a, b], [wrongParent, source(b.id, { contentTypeId: '38', pet: { acmpyTypeCd: '부분동반' } })]);
  assert.equal(result.counts.places, 2);
  assert.equal(result.counts.known, 1);
  assert.equal(result.counts.unknown, 1);
  assert.equal(result.counts.unmatchedSources, 1);
  assert.equal(result.counts.missingSources, 1);
  assert.equal(result.places.find((p) => p.id === b.id)?.category, 'shopping');
});

test('invalid document identities fail rather than silently changing favorite IDs', () => {
  assert.throws(() => adaptPlace(place('place-1')), /Invalid catalog/);
  assert.throws(() => adaptPlace(place(undefined, { placeId: 'kto-1' })), /Invalid catalog/);
});

test('catalog joins two bulk reads; rejects incomplete loads; explicit retry succeeds', async () => {
  let placeReads = 0, sourceReads = 0, fail = true;
  const readPlaces = async () => { placeReads++; return [place(), place('kto-2')]; };
  const readSourcesForPlaces = async () => {
    sourceReads++;
    if (fail) throw new Error('permission-denied');
    return [source(), source('kto-2', { contentTypeId: '12' })];
  };
  await assert.rejects(loadCatalogWith(readPlaces, readSourcesForPlaces), /permission-denied/);
  fail = false;
  assert.equal((await loadCatalogWith(readPlaces, readSourcesForPlaces)).counts.places, 2);
  assert.deepEqual([placeReads, sourceReads], [2, 2]);
});

test('adapter ID flows through the existing favorites session; legacy entries stay stored but are hidden', async () => {
  const stored = new Set(['place-1']); const writes: string[] = []; let deletes = 0;
  const session = createFavoritesSession({ listFavorites: async () => [...stored], addFavorite: async (uid, id) => { writes.push(`users/${uid}/favorites/${id}`); stored.add(id); }, removeFavorite: async () => { deletes++; } });
  const catalog = joinPlacesCatalog([place()], [source()]);
  await session.setUser('test-owner');
  assert.deepEqual(savedCatalogPlaces(catalog.places, session.getSnapshot().ids), []);
  await session.toggle(catalog.places[0].id);
  assert.deepEqual(writes, ['users/test-owner/favorites/kto-3401751']);
  assert.equal(savedCatalogPlaces(catalog.places, session.getSnapshot().ids).length, 1);
  assert.equal(stored.has('place-1'), true);
  assert.equal(deletes, 0);
});
