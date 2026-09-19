import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ADMIN_FIELD_DEFINITIONS,
  ADMIN_PLACE_QUERY_LIMIT,
  applyAdminLeafPatch,
  buildAdminEditPlan,
  placeNamePrefixBounds,
  validatePlacePrefix,
  sameAdminPlaceRevision,
  type AdminLoadedPlace,
} from '../src/lib/adminPlaceEditor.ts';

function loaded(): AdminLoadedPlace {
  const petPolicy = {
    petInformationStatus: 'KTO_OVERLAY_FOUND', petAcceptance: 'UNKNOWN', smallDogAllowed: 'UNKNOWN',
    mediumDogAllowed: 'UNKNOWN', largeDogAllowed: 'UNKNOWN', indoorAllowed: 'UNKNOWN', outdoorAllowed: 'UNKNOWN',
    carrierRequired: 'UNKNOWN', leashRequired: 'UNKNOWN', offLeashZoneAvailable: 'UNKNOWN',
    allowedBreeds: null, allowedSizes: null, sizeDescription: null, spacePolicy: null, spaceDescription: null,
    leashDescription: null, petFee: null, petFeeDescription: null, otherPetPolicy: null,
  };
  const amenities = { freeParking: 'UNKNOWN', dogMenu: 'UNKNOWN', waterBowlProvided: 'UNKNOWN', wasteBagsProvided: 'UNKNOWN', fencedYard: 'UNKNOWN', photoZone: 'UNKNOWN', parkingDescription: null };
  return {
    place: { id: 'kto-1', path: 'places/kto-1', data: { placeId: 'kto-1', name: '기존 장소', address: '제주시', roadAddress: null, phone: null, latitude: 33.4, longitude: 126.4, coordinateQualityStatus: 'OK', serviceCategory: null, regionArea: 'UNKNOWN', petPolicy, amenities } },
    source: { id: 'kto-areaBasedList2-1', path: 'places/kto-1/sources/kto-areaBasedList2-1', data: { placeSourceId: 'kto-areaBasedList2-1', placeId: 'kto-1', source: 'KTO', collector: { hasPetJoin: 'Y' }, kto: { title: '기존 장소', addr1: '제주시', tel: '064-000-0000', mapy: 33.4, mapx: 126.4, contentTypeId: '39', contentTypeName: '음식점', cat3: 'A05020900', pet: { acmpyNeedMtr: '기존 목줄' } } } },
  };
}

test('admin name query contract is nonblank, bounded, and uses a small limit', () => {
  assert.equal(validatePlacePrefix('  제주   카페  '), '제주 카페');
  assert.throws(() => validatePlacePrefix('   '), /한 글자/);
  assert.throws(() => validatePlacePrefix('가'.repeat(81)), /80자/);
  assert.ok(ADMIN_PLACE_QUERY_LIMIT > 0 && ADMIN_PLACE_QUERY_LIMIT <= 20);
  assert.deepEqual(placeNamePrefixBounds('제주'), { start: '제주', end: '제주\uf8ff', limit: ADMIN_PLACE_QUERY_LIMIT });
});

test('edit plan changes only selected display fields and preserves explicit clear intent', () => {
  const fixture = loaded();
  const plan = buildAdminEditPlan(fixture, ['shortDescription', 'phone', 'amenities.freeParking'], {
    shortDescription: '새 한 줄 설명', phone: '', 'amenities.freeParking': 'TRUE',
  }, ['phone'], 'admin-uid');
  assert.equal(plan.patch.shortDescription, '새 한 줄 설명');
  assert.equal(plan.patch.phone, '');
  assert.equal(plan.patch['amenities.freeParking'], 'TRUE');
  assert.equal('amenities' in plan.patch, false);
  assert.equal('name' in plan.patch, false);
  assert.equal('placeId' in plan.patch, false);
  assert.equal('search' in plan.patch, false);
  assert.deepEqual((plan.patch.manualAdmin as Record<string, unknown>).clearedFields, ['phone']);
  assert.deepEqual((plan.patch.manualAdmin as Record<string, unknown>).changedFields, ['amenities.freeParking', 'phone', 'shortDescription']);
  assert.deepEqual((plan.patch.manualAdmin as Record<string, unknown>).changedTopLevel, ['amenities', 'phone', 'shortDescription']);
  assert.deepEqual((plan.patch.manualAdmin as Record<string, unknown>).managedFields, ['amenities.freeParking', 'phone', 'shortDescription']);
  assert.equal((plan.patch.manualAdmin as Record<string, unknown>).source, 'ADMIN_UI');
  assert.equal('updatedBy' in (plan.patch.manualAdmin as Record<string, unknown>), false);
  assert.deepEqual(plan.unchangedSelections, []);
});

test('multiple distinct edits all appear and the confirmation changes match the display patch', () => {
  const fixture = loaded();
  const plan = buildAdminEditPlan(fixture, ['shortDescription', 'phone', 'primaryImageUrl'], {
    shortDescription: '새 한 줄 설명',
    phone: '064-123-4567',
    primaryImageUrl: 'https://example.test/new.jpg',
  }, [], 'admin-uid');
  const displayedChanges = Object.fromEntries(plan.changes.map(({ id, after }) => [id, after]));
  assert.deepEqual(displayedChanges, {
    shortDescription: '새 한 줄 설명',
    phone: '064-123-4567',
    primaryImageUrl: 'https://example.test/new.jpg',
  });
  assert.deepEqual(
    Object.fromEntries(Object.keys(displayedChanges).map((id) => [id, plan.patch[id]])),
    displayedChanges,
  );
  assert.deepEqual(plan.unchangedSelections, []);
});

test('multiple explicit clears all appear when their effective values exist', () => {
  const fixture = loaded();
  (fixture.source.data.kto as Record<string, unknown>).firstImage = 'https://example.test/current.jpg';
  const ids = ['shortDescription', 'phone', 'primaryImageUrl'];
  const plan = buildAdminEditPlan(fixture, ids, {}, ids, 'admin-uid');
  assert.deepEqual(plan.changes.map(({ id }) => id), ids);
  assert.equal(plan.changes.every(({ cleared }) => cleared), true);
  assert.deepEqual(
    Object.fromEntries(ids.map((id) => [id, plan.patch[id]])),
    { shortDescription: '', phone: '', primaryImageUrl: '' },
  );
  assert.deepEqual((plan.patch.manualAdmin as Record<string, unknown>).clearedFields, ['phone', 'primaryImageUrl', 'shortDescription']);
});

test('selected fields omitted only because their effective value is unchanged are identified', () => {
  const fixture = loaded();
  const plan = buildAdminEditPlan(fixture, ['shortDescription', 'phone'], {
    shortDescription: '음식점', phone: '064-123-4567',
  }, [], 'admin-uid');
  assert.deepEqual(plan.changes.map(({ id }) => id), ['phone']);
  assert.deepEqual(plan.unchangedSelections, [{ id: 'shortDescription', label: '한 줄 설명', value: '음식점' }]);
  assert.throws(
    () => buildAdminEditPlan(fixture, ['shortDescription'], { shortDescription: '음식점' }, [], 'admin-uid'),
    /현재 표시값과 같아 저장에서 제외된 선택 항목: 한 줄 설명/,
  );
});

test('pet text uses sparse override, clear uses key presence, and source is untouched', () => {
  const fixture = loaded();
  const plan = buildAdminEditPlan(fixture, ['petDetails.acmpyNeedMtr'], { 'petDetails.acmpyNeedMtr': '' }, ['petDetails.acmpyNeedMtr'], 'admin-uid');
  assert.equal(plan.patch['adminOverrides.petDetails.acmpyNeedMtr'], '');
  assert.equal(plan.patch['petPolicy.petInformationStatus'], 'ADMIN_CONFIRMED');
  assert.equal('adminOverrides' in plan.patch, false);
  assert.equal('source' in plan.patch, false);
  assert.equal((fixture.source.data.kto as Record<string, unknown>).pet instanceof Object, true);
  assert.deepEqual(plan.changes.map(({ id }) => id), ['petDetails.acmpyNeedMtr', 'petPolicy.petInformationStatus']);
});

test('pet fact edits automatically become administrator-confirmed without exposing status as editable', () => {
  const fixture = loaded();
  (fixture.place.data.petPolicy as Record<string, unknown>).petInformationStatus = 'UNKNOWN';
  (fixture.source.data.collector as Record<string, unknown>).hasPetJoin = 'N';
  (fixture.source.data.kto as Record<string, unknown>).pet = null;
  const plan = buildAdminEditPlan(fixture, ['petDetails.acmpyNeedMtr'], { 'petDetails.acmpyNeedMtr': '목줄' }, [], 'admin');
  assert.equal(plan.patch['petPolicy.petInformationStatus'], 'ADMIN_CONFIRMED');
  assert.equal(ADMIN_FIELD_DEFINITIONS.some((field) => field.id === 'petPolicy.petInformationStatus'), false);
  assert.deepEqual(plan.changes.at(-1), {
    id: 'petPolicy.petInformationStatus', label: '반려동물 정보 상태 (자동)', before: 'UNKNOWN', after: 'ADMIN_CONFIRMED', cleared: false,
  });
});

test('effective fallbacks do not become false overrides and nested leaf projection preserves siblings', () => {
  const fixture = loaded();
  assert.throws(() => buildAdminEditPlan(fixture, ['shortDescription'], { shortDescription: '음식점' }, [], 'admin'), /현재 표시값과 같아 저장에서 제외된 선택 항목: 한 줄 설명/);
  assert.throws(() => buildAdminEditPlan(fixture, ['fullDescription'], { fullDescription: '상세 소개 정보가 아직 등록되지 않았습니다.' }, [], 'admin'), /현재 표시값과 같아 저장에서 제외된 선택 항목: 상세 설명/);
  const plan = buildAdminEditPlan(fixture, ['amenities.freeParking'], { 'amenities.freeParking': 'TRUE' }, [], 'admin');
  const concurrent = structuredClone(fixture.place.data);
  (concurrent.amenities as Record<string, unknown>).dogMenu = 'TRUE';
  const projected = applyAdminLeafPatch(concurrent, plan.patch);
  assert.equal((projected.amenities as Record<string, unknown>).freeParking, 'TRUE');
  assert.equal((projected.amenities as Record<string, unknown>).dogMenu, 'TRUE');
});

test('managed fields remain cumulative and an already-confirmed pet edit does not claim a false status change', () => {
  const fixture = loaded();
  fixture.place.data.manualAdmin = {
    source: 'ADMIN_UI', managedFields: ['phone'], changedFields: ['shortDescription'], clearedFields: ['closedDays'],
  };
  (fixture.place.data.petPolicy as Record<string, unknown>).petInformationStatus = 'ADMIN_CONFIRMED';
  const plan = buildAdminEditPlan(fixture, ['petDetails.acmpyNeedMtr'], { 'petDetails.acmpyNeedMtr': '새 필요 사항' }, [], 'admin');
  const audit = plan.patch.manualAdmin as Record<string, unknown>;
  assert.deepEqual(audit.changedTopLevel, ['adminOverrides']);
  assert.deepEqual(audit.managedFields, ['closedDays', 'petDetails.acmpyNeedMtr', 'phone', 'shortDescription']);
  assert.equal('petPolicy.petInformationStatus' in plan.patch, false);
  assert.deepEqual(plan.changes.map(({ id }) => id), ['petDetails.acmpyNeedMtr']);
});

test('revision comparison handles Firestore timestamp shape and rejects stale revisions', () => {
  assert.equal(sameAdminPlaceRevision({ seconds: 10, nanoseconds: 20 }, { seconds: 10, nanoseconds: 20 }), true);
  assert.equal(sameAdminPlaceRevision({ seconds: 10, nanoseconds: 20 }, { seconds: 11, nanoseconds: 0 }), false);
  assert.equal(sameAdminPlaceRevision(undefined, undefined), true);
});

test('a single coordinate edit validates against the unchanged KTO fallback coordinate', () => {
  const fixture = loaded();
  fixture.place.data.latitude = null;
  fixture.place.data.longitude = null;
  const plan = buildAdminEditPlan(fixture, ['latitude'], { latitude: '33.5' }, [], 'admin');
  assert.equal(plan.patch.latitude, 33.5);
  assert.equal('longitude' in plan.patch, false);
  assert.equal(plan.patch.coordinateQualityStatus, 'ADMIN_CONFIRMED');
});

test('edit validation rejects accidental blanks, unsafe URLs, and out-of-Jeju coordinates', () => {
  const fixture = loaded();
  assert.throws(() => buildAdminEditPlan(fixture, ['shortDescription'], { shortDescription: '   ' }, [], 'admin'), /값 지우기/);
  assert.throws(() => buildAdminEditPlan(fixture, ['primaryImageUrl'], { primaryImageUrl: 'javascript:alert(1)' }, [], 'admin'), /http\/https/);
  assert.throws(() => buildAdminEditPlan(fixture, ['latitude'], { latitude: '37.5' }, [], 'admin'), /제주 범위/);
  assert.throws(() => buildAdminEditPlan(fixture, ['latitude'], { latitude: '' }, ['latitude'], 'admin'), /함께 입력하거나 두 값을 함께/);
  const cleared = buildAdminEditPlan(fixture, ['latitude', 'longitude'], { latitude: '', longitude: '' }, ['latitude', 'longitude'], 'admin');
  assert.equal(cleared.patch.latitude, null);
  assert.equal(cleared.patch.longitude, null);
  assert.equal(cleared.patch.coordinateQualityStatus, 'ADMIN_CONFIRMED');
  assert.throws(() => buildAdminEditPlan(fixture, [], {}, [], 'admin'), /하나 이상/);
  assert.equal(ADMIN_FIELD_DEFINITIONS.some((field) => field.id.startsWith('search.')), false);
});
