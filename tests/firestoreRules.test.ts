import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  collection, collectionGroup, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs,
  getFirestore, query, serverTimestamp, setDoc, updateDoc, where, type Firestore,
} from 'firebase/firestore/lite';
import { ADMIN_FIELD_DEFINITIONS } from '../src/lib/adminPlaceEditor';

const emulator = process.env.FIRESTORE_EMULATOR_HOST;

function restValue(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(restValue) } };
  const entries = Object.entries(value as Record<string, unknown>);
  return { mapValue: { fields: Object.fromEntries(entries.map(([key, entry]) => [key, restValue(entry)])) } };
}

const petPolicy = {
  petInformationStatus: 'KTO_OVERLAY_FOUND', petAcceptance: 'UNKNOWN', smallDogAllowed: 'UNKNOWN',
  mediumDogAllowed: 'UNKNOWN', largeDogAllowed: 'UNKNOWN', indoorAllowed: 'UNKNOWN', outdoorAllowed: 'UNKNOWN',
  carrierRequired: 'UNKNOWN', leashRequired: 'UNKNOWN', offLeashZoneAvailable: 'UNKNOWN',
  allowedBreeds: null, allowedSizes: null, sizeDescription: null, spacePolicy: null,
  spaceDescription: null, leashDescription: null, petFee: null, petFeeDescription: null, otherPetPolicy: null,
};
const amenities = { freeParking: 'UNKNOWN', dogMenu: 'UNKNOWN', waterBowlProvided: 'UNKNOWN', wasteBagsProvided: 'UNKNOWN', fencedYard: 'UNKNOWN', photoZone: 'UNKNOWN', parkingDescription: null };
const petDetailKeys = [
  'acmpyTypeCd', 'acmpyNeedMtr', 'acmpyPsblCpam', 'etcAcmpyInfo',
  'relaAcdntRiskMtr', 'relaFrnshPrdlst', 'relaPosesFclty',
  'relaPurcPrdlst', 'relaRntlPrdlst',
] as const;
const allUiFieldIds = ADMIN_FIELD_DEFINITIONS.map(({ id }) => id).sort();
const allAuditFieldIds = [...allUiFieldIds, 'petPolicy.petInformationStatus'].sort();
const allChangedTopLevel = [
  'address', 'adminOverrides', 'amenities', 'businessHours', 'cautionNotes', 'closedDays',
  'fullDescription', 'instagramUrl', 'latitude', 'longitude', 'name', 'parkingInfo', 'petPolicy',
  'phone', 'primaryImageUrl', 'recommendedPoints', 'regionArea', 'roadAddress',
  'secondaryImageUrl', 'serviceCategory', 'shortDescription', 'tags',
].sort();
const allRootClearableIds = [
  'address', 'roadAddress', 'latitude', 'longitude', 'phone', 'primaryImageUrl',
  'secondaryImageUrl', 'shortDescription', 'fullDescription', 'parkingInfo',
  'businessHours', 'closedDays', 'instagramUrl', 'tags', 'recommendedPoints', 'cautionNotes',
].sort();
const baseSearch = {
  version: 1, region: 'JEJU_CITY', category: 'CAFE', regionBasis: 'MUNICIPALITY', categoryBasis: 'KTO_CAT3',
  basicScore: 10, petScore: 2, totalScore: 12, scoreVersion: 'hank-place-field-audit-v1',
  petTier: 'PARTIAL', petSortKey: 20210, primarySourceId: 'canonical', inputHash: 'a'.repeat(64),
};
const basePlace = {
  placeId: 'kto-1', name: '기존 장소', serviceCategory: 'CAFE', regionArea: 'UNKNOWN', municipality: 'JEJU_CITY',
  address: '제주특별자치도 제주시', roadAddress: null, latitude: 33.4, longitude: 126.4, coordinateQualityStatus: 'OK',
  phone: '064-000-0000', primaryImageUrl: null, secondaryImageUrl: null, shortDescription: null, fullDescription: null,
  parkingInfo: null, businessHours: null, closedDays: null, instagramUrl: null, tags: null,
  recommendedPoints: null, cautionNotes: null, petPolicy, amenities, search: baseSearch,
};
const aouAouLiveShapePlace = {
  placeId: 'kto-99999999', name: '아우아우', serviceCategory: null, regionArea: null, municipality: 'JEJU_CITY',
  address: '제주특별자치도 제주시', roadAddress: null, latitude: 33.4, longitude: 126.4, coordinateQualityStatus: 'OK',
  phone: null, primaryImageUrl: null, secondaryImageUrl: null, shortDescription: null, fullDescription: null,
  parkingInfo: null, businessHours: null, closedDays: null, instagramUrl: null, tags: null,
  recommendedPoints: null, cautionNotes: null, petPolicy, amenities,
  search: { ...baseSearch, derivedAt: new Date('2026-09-19T00:00:00.000Z') },
  updatedAt: new Date('2026-09-19T00:00:00.000Z'),
};

function validUpdate(uid: string, name: string) {
  void uid;
  return {
    name,
    manualAdmin: {
      source: 'ADMIN_UI', updatedAt: serverTimestamp(), changedFields: ['name'], changedTopLevel: ['name'],
      clearedFields: [], managedFields: ['name'],
    },
    search: { ...baseSearch, inputHash: 'b'.repeat(64), derivedAt: serverTimestamp() },
    updatedAt: serverTimestamp(),
  };
}

// Start an emulator with this repository's firestore.rules before running.
// Seed/write tests are strictly confined to a local emulator and demo project.
test('rules enforce active-admin place updates while preserving public catalog and owner favorites', {
  skip: !emulator ? 'Requires a local Firestore emulator; never run against production.' : false,
}, async () => {
  assert.match(emulator!, /^127\.0\.0\.1:[0-9]+$/);
  const port = Number(emulator!.split(':')[1]);
  assert.ok(port > 0 && port <= 65535);
  const project = 'demo-admin-place-editor-rules';
  assert.match(project, /^demo-/);
  const base = `http://${emulator}/v1/projects/${project}/databases/(default)/documents`;
  const identities = [null, 'normal', 'inactive', 'wrong-role', 'active-admin', 'other-admin'] as const;
  const apps = identities.map((uid, index) => initializeApp({ projectId: project }, `${project}-${uid ?? 'guest'}-${index}`));
  const databases = apps.map((app, index) => {
    const firestore = getFirestore(app);
    const uid = identities[index];
    connectFirestoreEmulator(firestore, '127.0.0.1', port, uid ? { mockUserToken: { sub: uid } } : undefined);
    return firestore;
  });
  const [guest, normal, inactive, wrongRole, active, otherAdmin] = databases;
  const denied = (request: Promise<unknown>) => assert.rejects(request, { code: 'permission-denied' });
  const seed = async (path: string, values: Record<string, unknown>) => {
    const response = await fetch(`${base}/${path}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify((restValue(values).mapValue as { fields: Record<string, unknown> })),
    });
    assert.equal(response.status, 200, await response.text());
  };
  try {
    await seed('places/kto-1', basePlace);
    await seed('places/kto-99999999', aouAouLiveShapePlace);
    const sparsePlace = { ...basePlace, placeId: 'kto-3', search: { ...baseSearch } } as Record<string, unknown>;
    delete sparsePlace.serviceCategory;
    delete sparsePlace.regionArea;
    await seed('places/kto-3', sparsePlace);
    await seed('places/kto-1/sources/canonical', { source: 'KTO', placeId: 'kto-1' });
    await seed('places/kto-99999999/sources/canonical', { source: 'KTO', placeId: 'kto-99999999', immutable: 'worst-case-proof' });
    await seed('places/kto-2/sources/nested-public', { source: 'OTHER', placeId: 'kto-2' });
    await seed('misc/rules/sources/valid-kto', { source: 'KTO', placeId: 'kto-2' });
    await seed('misc/rules/sources/private', { source: 'OTHER', placeId: 'kto-3' });
    await seed('misc/rules/sources/invalid', { source: 'KTO', placeId: 'unrelated' });
    await seed('misc/rules/sources/missing', { source: 'KTO' });
    await seed('admins/normal', { role: 'user', active: true });
    await seed('admins/inactive', { role: 'admin', active: false });
    await seed('admins/wrong-role', { role: 'owner', active: true });
    await seed('admins/active-admin', { role: 'admin', active: true });
    await seed('admins/other-admin', { role: 'admin', active: true });

    assert.equal((await getDocs(collection(guest, 'places'))).empty, false);
    assert.equal((await getDoc(doc(guest, 'places/kto-2/sources/nested-public'))).exists(), true);
    await denied(getDocs(collectionGroup(guest, 'sources')));
    await denied(getDocs(query(collectionGroup(guest, 'sources'), where('source', '==', 'KTO'))));
    const constrained = await getDocs(query(collectionGroup(guest, 'sources'), where('source', '==', 'KTO'), where('placeId', 'in', ['kto-1', 'kto-2'])));
    assert.equal(constrained.size, 2);
    await denied(getDocs(query(collectionGroup(guest, 'sources'), where('source', '==', 'KTO'), where('placeId', 'in', ['kto-1', 'invalid']))));
    for (const id of ['private', 'invalid', 'missing']) await denied(getDoc(doc(guest, `misc/rules/sources/${id}`)));

    assert.equal((await getDoc(doc(active, 'admins/active-admin'))).exists(), true);
    await denied(getDoc(doc(guest, 'admins/active-admin')));
    await denied(getDoc(doc(active, 'admins/other-admin')));
    await denied(getDocs(collection(active, 'admins')));
    await denied(setDoc(doc(normal, 'admins/normal'), { role: 'admin', active: true }));
    await denied(updateDoc(doc(active, 'admins/active-admin'), { active: false }));

    await denied(updateDoc(doc(normal, 'places/kto-1'), validUpdate('normal', '일반 사용자 변경')));
    await denied(updateDoc(doc(inactive, 'places/kto-1'), validUpdate('inactive', '비활성 변경')));
    await denied(updateDoc(doc(wrongRole, 'places/kto-1'), validUpdate('wrong-role', '잘못된 역할 변경')));
    await updateDoc(doc(active, 'places/kto-1'), {
      ...validUpdate('active-admin', '관리자 변경'),
      address: '제주특별자치도 제주시 새 주소',
      manualAdmin: {
        source: 'ADMIN_UI', updatedAt: serverTimestamp(), changedFields: ['address', 'name'],
        changedTopLevel: ['address', 'name'], clearedFields: [], managedFields: ['address', 'name'],
      },
    });
    assert.equal((await getDoc(doc(guest, 'places/kto-1'))).data()?.name, '관리자 변경');
    await updateDoc(doc(active, 'places/kto-3'), validUpdate('active-admin', 'sparse 관리자 변경'));
    assert.equal((await getDoc(doc(guest, 'places/kto-3'))).data()?.name, 'sparse 관리자 변경');
    const liveShapeChanges = {
      phone: '064-765-4321',
      primaryImageUrl: 'https://example.test/aou-aou.jpg',
      shortDescription: '반려견과 함께 쉬어 가는 공간',
    };
    await updateDoc(doc(active, 'places/kto-99999999'), {
      ...liveShapeChanges,
      manualAdmin: {
        source: 'ADMIN_UI', updatedAt: serverTimestamp(),
        changedFields: ['phone', 'primaryImageUrl', 'shortDescription'],
        changedTopLevel: ['phone', 'primaryImageUrl', 'shortDescription'],
        clearedFields: [], managedFields: ['phone', 'primaryImageUrl', 'shortDescription'],
      },
      search: { ...baseSearch, inputHash: '9'.repeat(64), derivedAt: serverTimestamp() },
      updatedAt: serverTimestamp(),
    });
    const savedLiveShape = (await getDoc(doc(guest, 'places/kto-99999999'))).data();
    assert.deepEqual(
      Object.fromEntries(Object.keys(liveShapeChanges).map((key) => [key, savedLiveShape?.[key]])),
      liveShapeChanges,
    );

    const ownerSevenFieldChanges = {
      shortDescription: '아우아우 7개 필드 저장 재현',
      fullDescription: 'Owner가 실제 관리 화면에서 시도한 다중 저장 조합을 재현하는 설명입니다.',
      phone: '064-123-4567',
      primaryImageUrl: 'https://example.test/aou-aou-primary.jpg',
      secondaryImageUrl: 'https://example.test/aou-aou-secondary.jpg',
      instagramUrl: 'https://www.instagram.com/aouaou_e2e',
      amenities: { ...amenities, parkingDescription: '주차 편의 상세 7개 필드 재현' },
    };
    const ownerSevenChangedFields = [
      'amenities.parkingDescription', 'fullDescription', 'instagramUrl', 'phone',
      'primaryImageUrl', 'secondaryImageUrl', 'shortDescription',
    ];
    await updateDoc(doc(active, 'places/kto-99999999'), {
      ...ownerSevenFieldChanges,
      manualAdmin: {
        source: 'ADMIN_UI', updatedAt: serverTimestamp(),
        changedFields: ownerSevenChangedFields,
        changedTopLevel: [
          'amenities', 'fullDescription', 'instagramUrl', 'phone',
          'primaryImageUrl', 'secondaryImageUrl', 'shortDescription',
        ],
        clearedFields: [], managedFields: ownerSevenChangedFields,
      },
      search: { ...baseSearch, inputHash: '7'.repeat(64), derivedAt: serverTimestamp() },
      updatedAt: serverTimestamp(),
    });
    const savedSevenField = (await getDoc(doc(guest, 'places/kto-99999999'))).data();
    assert.equal(savedSevenField?.shortDescription, ownerSevenFieldChanges.shortDescription);
    assert.equal(savedSevenField?.fullDescription, ownerSevenFieldChanges.fullDescription);
    assert.equal(savedSevenField?.phone, ownerSevenFieldChanges.phone);
    assert.equal(savedSevenField?.primaryImageUrl, ownerSevenFieldChanges.primaryImageUrl);
    assert.equal(savedSevenField?.secondaryImageUrl, ownerSevenFieldChanges.secondaryImageUrl);
    assert.equal(savedSevenField?.instagramUrl, ownerSevenFieldChanges.instagramUrl);
    assert.equal(savedSevenField?.amenities?.parkingDescription, ownerSevenFieldChanges.amenities.parkingDescription);

    const allEditPetPolicy = {
      petInformationStatus: 'ADMIN_CONFIRMED', petAcceptance: 'TRUE', smallDogAllowed: 'TRUE',
      mediumDogAllowed: 'FALSE', largeDogAllowed: 'TRUE', indoorAllowed: 'TRUE', outdoorAllowed: 'FALSE',
      carrierRequired: 'TRUE', leashRequired: 'FALSE', offLeashZoneAvailable: 'TRUE',
      allowedBreeds: ['all-breed'], allowedSizes: ['small', 'large'], sizeDescription: 'all size description',
      spacePolicy: 'ALL_SPACE', spaceDescription: 'all space description', leashDescription: 'all leash description',
      petFee: 12000, petFeeDescription: 'all fee description', otherPetPolicy: 'all other policy',
    };
    const allEditPetDetails = Object.fromEntries(petDetailKeys.map((key) => [key, `all-${key}`]));
    const allEditAmenities = {
      freeParking: 'TRUE', dogMenu: 'TRUE', waterBowlProvided: 'FALSE', wasteBagsProvided: 'TRUE',
      fencedYard: 'FALSE', photoZone: 'TRUE', parkingDescription: 'all amenities parking',
    };
    const allEditSearch = {
      ...baseSearch, region: 'WEST', category: 'FOOD', regionBasis: 'SERVICE_REGION',
      categoryBasis: 'SERVICE_CATEGORY', basicScore: 15, petScore: 9, totalScore: 24,
      petTier: 'RICH', petSortKey: 30915, inputHash: '1'.repeat(64), derivedAt: serverTimestamp(),
    };
    const sourceBeforeWorstCases = (await getDoc(doc(guest, 'places/kto-99999999/sources/canonical'))).data();
    await updateDoc(doc(active, 'places/kto-99999999'), {
      name: '아우아우 전체 필드 수정', serviceCategory: 'FOOD', regionArea: 'WEST',
      address: '제주특별자치도 제주시 전체 수정', roadAddress: '제주 전체로 1',
      latitude: 33.45, longitude: 126.3, coordinateQualityStatus: 'ADMIN_CONFIRMED',
      phone: '064-222-3333', primaryImageUrl: 'https://example.test/all-primary.jpg',
      secondaryImageUrl: 'https://example.test/all-secondary.jpg', shortDescription: 'all short',
      fullDescription: 'all full', parkingInfo: 'all parking', businessHours: 'all hours',
      closedDays: 'all closed', instagramUrl: 'https://instagram.com/all_edit', tags: ['all', 'edit'],
      petPolicy: allEditPetPolicy, adminOverrides: { petDetails: allEditPetDetails },
      amenities: allEditAmenities, recommendedPoints: ['all recommendation'], cautionNotes: ['all caution'],
      manualAdmin: {
        source: 'ADMIN_UI', updatedAt: serverTimestamp(), changedFields: allAuditFieldIds,
        changedTopLevel: allChangedTopLevel, clearedFields: [], managedFields: allAuditFieldIds,
      },
      search: allEditSearch,
      updatedAt: serverTimestamp(),
    });
    const savedAllEdit = (await getDoc(doc(guest, 'places/kto-99999999'))).data();
    assert.equal(savedAllEdit?.name, '아우아우 전체 필드 수정');
    assert.deepEqual(savedAllEdit?.petPolicy, allEditPetPolicy);
    assert.deepEqual(savedAllEdit?.adminOverrides?.petDetails, allEditPetDetails);
    assert.deepEqual(savedAllEdit?.amenities, allEditAmenities);
    assert.deepEqual(savedAllEdit?.manualAdmin?.changedFields, allAuditFieldIds);
    assert.deepEqual(savedAllEdit?.manualAdmin?.changedTopLevel, allChangedTopLevel);
    assert.deepEqual(savedAllEdit?.manualAdmin?.managedFields, allAuditFieldIds);
    assert.deepEqual(
      (await getDoc(doc(guest, 'places/kto-99999999/sources/canonical'))).data(),
      sourceBeforeWorstCases,
    );

    const mixedPetPolicy = {
      petInformationStatus: 'ADMIN_CONFIRMED', petAcceptance: 'FALSE', smallDogAllowed: 'FALSE',
      mediumDogAllowed: 'TRUE', largeDogAllowed: 'FALSE', indoorAllowed: 'FALSE', outdoorAllowed: 'TRUE',
      carrierRequired: 'FALSE', leashRequired: 'TRUE', offLeashZoneAvailable: 'FALSE',
      allowedBreeds: null, allowedSizes: null, sizeDescription: null, spacePolicy: null,
      spaceDescription: null, leashDescription: null, petFee: null, petFeeDescription: null, otherPetPolicy: null,
    };
    const mixedPetDetails = Object.fromEntries(petDetailKeys.map((key) => [key, '']));
    const mixedAmenities = {
      freeParking: 'FALSE', dogMenu: 'FALSE', waterBowlProvided: 'TRUE', wasteBagsProvided: 'FALSE',
      fencedYard: 'TRUE', photoZone: 'FALSE', parkingDescription: null,
    };
    const mixedSearch = {
      ...baseSearch, region: 'EAST', category: 'CULTURE', regionBasis: 'SERVICE_REGION',
      categoryBasis: 'SERVICE_CATEGORY', basicScore: 9, petScore: 5, totalScore: 14,
      petTier: 'RICH', petSortKey: 30509, inputHash: '2'.repeat(64), derivedAt: serverTimestamp(),
    };
    await updateDoc(doc(active, 'places/kto-99999999'), {
      name: '아우아우 혼합 수정', serviceCategory: 'CULTURE', regionArea: 'EAST',
      address: '', roadAddress: '', latitude: null, longitude: null, phone: '',
      primaryImageUrl: '', secondaryImageUrl: '', shortDescription: '', fullDescription: '',
      parkingInfo: '', businessHours: '', closedDays: '', instagramUrl: '', tags: [],
      petPolicy: mixedPetPolicy, adminOverrides: { petDetails: mixedPetDetails }, amenities: mixedAmenities,
      recommendedPoints: [], cautionNotes: [],
      manualAdmin: {
        source: 'ADMIN_UI', updatedAt: serverTimestamp(), changedFields: allUiFieldIds,
        changedTopLevel: allChangedTopLevel, clearedFields: allRootClearableIds,
        managedFields: allAuditFieldIds,
      },
      search: mixedSearch,
      updatedAt: serverTimestamp(),
    });
    const savedMixed = (await getDoc(doc(guest, 'places/kto-99999999'))).data();
    assert.equal(savedMixed?.name, '아우아우 혼합 수정');
    assert.equal(savedMixed?.address, '');
    assert.equal(savedMixed?.latitude, null);
    assert.deepEqual(savedMixed?.tags, []);
    assert.deepEqual(savedMixed?.petPolicy, mixedPetPolicy);
    assert.deepEqual(savedMixed?.adminOverrides?.petDetails, mixedPetDetails);
    assert.deepEqual(savedMixed?.amenities, mixedAmenities);
    assert.deepEqual(savedMixed?.manualAdmin?.changedFields, allUiFieldIds);
    assert.deepEqual(savedMixed?.manualAdmin?.clearedFields, allRootClearableIds);
    assert.deepEqual(savedMixed?.manualAdmin?.managedFields, allAuditFieldIds);
    assert.deepEqual(
      (await getDoc(doc(guest, 'places/kto-99999999/sources/canonical'))).data(),
      sourceBeforeWorstCases,
    );

    for (const search of [
      { ...baseSearch, injected: true },
      { ...baseSearch, totalScore: 13 },
      { ...baseSearch, primarySourceId: 'other-source' },
    ]) {
      await denied(updateDoc(doc(active, 'places/kto-1'), {
        ...validUpdate('active-admin', '검색 보호값 공격'),
        search: { ...search, inputHash: '8'.repeat(64), derivedAt: serverTimestamp() },
      }));
    }

    await denied(updateDoc(doc(active, 'places/kto-1'), { ...validUpdate('active-admin', '보호값 공격'), placeId: 'kto-evil' }));
    await denied(updateDoc(doc(active, 'places/kto-1'), {
      ...validUpdate('active-admin', '중첩 공격'),
      petPolicy: { ...petPolicy, injected: true },
      manualAdmin: {
        source: 'ADMIN_UI', updatedAt: serverTimestamp(), changedFields: ['name', 'petPolicy.petAcceptance'],
        changedTopLevel: ['name', 'petPolicy'], clearedFields: [], managedFields: ['address', 'name', 'petPolicy.petAcceptance'],
      },
    }));
    const attackAudit = (changedFields: string[], changedTopLevel: string[], clearedFields: string[] = []) => ({
      source: 'ADMIN_UI', updatedAt: serverTimestamp(), changedFields, changedTopLevel, clearedFields,
      managedFields: [...new Set(['address', 'name', ...changedFields])].sort(),
    });
    await denied(updateDoc(doc(active, 'places/kto-1'), {
      petPolicy: { ...petPolicy, petAcceptance: 'TRUE' },
      manualAdmin: attackAudit(['name'], ['petPolicy']),
      search: { ...baseSearch, inputHash: 'c'.repeat(64), derivedAt: serverTimestamp() }, updatedAt: serverTimestamp(),
    }));
    await denied(updateDoc(doc(active, 'places/kto-1'), {
      petPolicy: { petInformationStatus: 'ADMIN_CONFIRMED', petAcceptance: 'TRUE' },
      manualAdmin: attackAudit(['petPolicy.petAcceptance', 'petPolicy.petInformationStatus'], ['petPolicy']),
      search: { ...baseSearch, inputHash: 'd'.repeat(64), derivedAt: serverTimestamp() }, updatedAt: serverTimestamp(),
    }));
    await denied(updateDoc(doc(active, 'places/kto-1'), {
      ...validUpdate('active-admin', '잘못된 enum'), serviceCategory: 123,
      manualAdmin: attackAudit(['name', 'serviceCategory'], ['name', 'serviceCategory']),
    }));
    await denied(updateDoc(doc(active, 'places/kto-1'), {
      ...validUpdate('active-admin', '카테고리 지우기'), serviceCategory: null,
      manualAdmin: attackAudit(['name', 'serviceCategory'], ['name', 'serviceCategory']),
    }));
    await denied(updateDoc(doc(active, 'places/kto-1'), {
      ...validUpdate('active-admin', '권역 지우기'), regionArea: null,
      manualAdmin: attackAudit(['name', 'regionArea'], ['name', 'regionArea']),
    }));
    await denied(updateDoc(doc(active, 'places/kto-1'), {
      ...validUpdate('active-admin', '잘못된 URL'), primaryImageUrl: 'javascript:alert(1)',
      manualAdmin: attackAudit(['name', 'primaryImageUrl'], ['name', 'primaryImageUrl']),
    }));
    await denied(updateDoc(doc(active, 'places/kto-1'), {
      ...validUpdate('active-admin', '잘못된 Instagram'), instagramUrl: 'https://evil.example/instagram.com',
      manualAdmin: attackAudit(['instagramUrl', 'name'], ['instagramUrl', 'name']),
    }));
    await denied(updateDoc(doc(active, 'places/kto-1'), {
      manualAdmin: attackAudit(['name'], ['name']),
      search: { ...baseSearch, inputHash: 'e'.repeat(64), derivedAt: serverTimestamp() }, updatedAt: serverTimestamp(),
    }));
    await denied(updateDoc(doc(active, 'places/kto-1'), {
      ...validUpdate('active-admin', ''), manualAdmin: attackAudit(['name'], ['name'], ['name']),
    }));
    await denied(updateDoc(doc(active, 'places/kto-1'), {
      petPolicy: { ...petPolicy, petInformationStatus: 'ADMIN_CONFIRMED' },
      manualAdmin: attackAudit(['petPolicy.petInformationStatus'], ['petPolicy']),
      search: { ...baseSearch, inputHash: 'f'.repeat(64), derivedAt: serverTimestamp() }, updatedAt: serverTimestamp(),
    }));
    await denied(updateDoc(doc(active, 'places/kto-1'), {
      ...validUpdate('active-admin', '경로 ID 공격'), placeId: 'kto-other',
      manualAdmin: attackAudit(['name'], ['name']),
    }));
    await denied(setDoc(doc(active, 'places/kto-new'), basePlace));
    await denied(deleteDoc(doc(active, 'places/kto-1')));
    await denied(setDoc(doc(active, 'places/kto-1/sources/created'), { source: 'KTO', placeId: 'kto-1' }));
    await denied(updateDoc(doc(active, 'places/kto-1/sources/canonical'), { source: 'ADMIN' }));
    await denied(deleteDoc(doc(active, 'places/kto-1/sources/canonical')));

    await denied(getDocs(collection(guest, 'users/normal/favorites')));
    await setDoc(doc(normal, 'users/normal/favorites/kto-1'), { placeId: 'kto-1', createdAt: serverTimestamp() });
    assert.equal((await getDocs(collection(normal, 'users/normal/favorites'))).size, 1);
    await denied(getDocs(collection(active, 'users/normal/favorites')));
    await denied(setDoc(doc(active, 'users/normal/favorites/kto-2'), { placeId: 'kto-2', createdAt: serverTimestamp() }));
    await deleteDoc(doc(normal, 'users/normal/favorites/kto-1'));
  } finally {
    await Promise.all(apps.map(deleteApp));
  }
});
