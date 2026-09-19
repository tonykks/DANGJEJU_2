import {
  collection,
  doc,
  endAt,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAt,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite';
import { effectiveList, effectiveNumber, effectivePetDetails, effectiveText, hasOwn, objectValue, PET_DETAIL_FIELDS, stringValues, trimmedText } from './effectivePlace';
import { deriveSearchFields } from './searchDerivation';
import { getPlace, getPlaceSource, guardedFirestoreRead, readSearchFields } from './placeSearch';
import type { CatalogDocument } from './placeAdapter';

export const ADMIN_PLACE_QUERY_LIMIT = 12;

export type AdminFieldKind = 'text' | 'textarea' | 'url' | 'number' | 'list' | 'category' | 'region' | 'triState';
export type AdminFieldGroup = '기본 정보' | '위치·연락처' | '이미지·운영' | '반려동물 상태·정책' | '반려동물 상세' | '편의시설' | '추천·주의';
type AdminTarget = 'root' | 'petPolicy' | 'petDetail' | 'amenities';

export type AdminFieldDefinition = {
  id: string;
  label: string;
  group: AdminFieldGroup;
  kind: AdminFieldKind;
  target: AdminTarget;
  key: string;
  allowClear?: boolean;
  placeholder?: string;
};

const root = (id: string, label: string, group: AdminFieldGroup, kind: AdminFieldKind, allowClear = true, placeholder?: string): AdminFieldDefinition => ({ id, label, group, kind, target: 'root', key: id, allowClear, placeholder });
const policy = (key: string, label: string, kind: AdminFieldKind = 'triState', allowClear = false): AdminFieldDefinition => ({ id: `petPolicy.${key}`, label, group: '반려동물 상태·정책', kind, target: 'petPolicy', key, allowClear });
const amenity = (key: string, label: string, kind: AdminFieldKind = 'triState', allowClear = false): AdminFieldDefinition => ({ id: `amenities.${key}`, label, group: '편의시설', kind, target: 'amenities', key, allowClear });

export const ADMIN_FIELD_DEFINITIONS: AdminFieldDefinition[] = [
  root('name', '장소명', '기본 정보', 'text', false),
  root('serviceCategory', '서비스 장소유형', '기본 정보', 'category', false),
  root('shortDescription', '한 줄 설명', '기본 정보', 'text'),
  root('fullDescription', '상세 설명', '기본 정보', 'textarea'),
  root('regionArea', '검색 권역', '위치·연락처', 'region', false),
  root('address', '지번/기본 주소', '위치·연락처', 'text'),
  root('roadAddress', '도로명 주소', '위치·연락처', 'text'),
  root('latitude', '위도', '위치·연락처', 'number'),
  root('longitude', '경도', '위치·연락처', 'number'),
  root('phone', '전화번호', '위치·연락처', 'text'),
  root('primaryImageUrl', '대표 이미지 URL', '이미지·운영', 'url'),
  root('secondaryImageUrl', '보조 이미지 URL', '이미지·운영', 'url'),
  root('parkingInfo', '주차정보', '이미지·운영', 'textarea'),
  root('businessHours', '운영시간', '이미지·운영', 'textarea'),
  root('closedDays', '휴무일', '이미지·운영', 'text'),
  root('instagramUrl', 'Instagram URL', '이미지·운영', 'url'),
  root('tags', '태그', '기본 정보', 'list', true, '쉼표 또는 줄바꿈으로 구분'),
  policy('petAcceptance', '반려동물 동반'),
  policy('smallDogAllowed', '소형견 동반'),
  policy('mediumDogAllowed', '중형견 동반'),
  policy('largeDogAllowed', '대형견 동반'),
  policy('indoorAllowed', '실내 동반'),
  policy('outdoorAllowed', '실외 동반'),
  policy('carrierRequired', '이동장 필요'),
  policy('leashRequired', '리드줄 필요'),
  policy('offLeashZoneAvailable', '오프리쉬 공간'),
  policy('allowedBreeds', '허용 견종', 'list', true),
  policy('allowedSizes', '허용 크기', 'list', true),
  policy('sizeDescription', '크기 상세', 'textarea', true),
  policy('spacePolicy', '공간 정책 코드/요약', 'text', true),
  policy('spaceDescription', '공간 이용 상세', 'textarea', true),
  policy('leashDescription', '리드줄 상세', 'textarea', true),
  policy('petFee', '반려동물 이용요금(원)', 'number', true),
  policy('petFeeDescription', '반려동물 요금 설명', 'textarea', true),
  policy('otherPetPolicy', '기타 반려동물 정책', 'textarea', true),
  ...PET_DETAIL_FIELDS.map(([key, label]) => ({ id: `petDetails.${key}`, label, group: '반려동물 상세' as const, kind: 'textarea' as const, target: 'petDetail' as const, key, allowClear: true })),
  amenity('freeParking', '무료 주차'),
  amenity('dogMenu', '반려견 메뉴'),
  amenity('waterBowlProvided', '물그릇 제공'),
  amenity('wasteBagsProvided', '배변봉투 제공'),
  amenity('fencedYard', '펜스 공간'),
  amenity('photoZone', '포토존'),
  amenity('parkingDescription', '주차 편의 상세', 'textarea', true),
  root('recommendedPoints', '추천 포인트', '추천·주의', 'list'),
  root('cautionNotes', '주의사항', '추천·주의', 'list'),
];

export type AdminLoadedPlace = {
  place: CatalogDocument;
  source: CatalogDocument;
};

export type AdminEditPlan = {
  patch: Record<string, unknown>;
  nextPlace: Record<string, unknown>;
  changes: { id: string; label: string; before: unknown; after: unknown; cleared: boolean }[];
};

function documentData(snapshot: QueryDocumentSnapshot): CatalogDocument {
  return { id: snapshot.id, path: snapshot.ref.path, data: snapshot.data() as Record<string, unknown> };
}

export function validatePlacePrefix(value: string): string {
  const prefix = value.trim().replace(/\s+/g, ' ');
  if (!prefix) throw new Error('장소명을 한 글자 이상 입력해 주세요.');
  if (prefix.length > 80) throw new Error('검색어는 80자 이하로 입력해 주세요.');
  return prefix;
}

export function placeNamePrefixBounds(value: string) {
  const prefix = validatePlacePrefix(value);
  return { start: prefix, end: `${prefix}\uf8ff`, limit: ADMIN_PLACE_QUERY_LIMIT } as const;
}

export async function searchAdminPlacesByName(db: Firestore, value: string): Promise<CatalogDocument[]> {
  const bounds = placeNamePrefixBounds(value);
  return guardedFirestoreRead(async () => {
    const snapshot = await getDocs(query(
      collection(db, 'places'),
      orderBy('name'),
      startAt(bounds.start),
      endAt(bounds.end),
      limit(bounds.limit),
    ));
    return snapshot.docs.map(documentData);
  });
}

export async function loadAdminPlace(db: Firestore, placeId: string): Promise<AdminLoadedPlace> {
  const place = await getPlace(db, placeId);
  if (!place) throw new Error('선택한 장소를 찾을 수 없습니다.');
  const sourceId = readSearchFields(place.data)?.primarySourceId;
  if (!sourceId) throw new Error('장소의 canonical source 연결정보가 없습니다.');
  const source = await getPlaceSource(db, placeId, sourceId);
  if (!source || source.data.source !== 'KTO' || source.data.placeId !== placeId) {
    throw new Error('장소의 canonical KTO source를 확인할 수 없습니다.');
  }
  return { place, source };
}

function currentRootValue(definition: AdminFieldDefinition, place: Record<string, unknown>, source: Record<string, unknown>): unknown {
  const kto = objectValue(source.kto);
  switch (definition.key) {
    case 'name': return effectiveText(place, 'name', kto.title);
    case 'serviceCategory': return trimmedText(place.serviceCategory) || readSearchFields(place)?.category || '';
    case 'regionArea': return trimmedText(place.regionArea) !== 'UNKNOWN' ? trimmedText(place.regionArea) : readSearchFields(place)?.region || 'UNKNOWN';
    case 'address': return effectiveText(place, 'address', kto.addr1);
    case 'roadAddress': return effectiveText(place, 'roadAddress', effectiveText(place, 'address', kto.addr1));
    case 'latitude': return effectiveNumber(place, 'latitude', kto.mapy);
    case 'longitude': return effectiveNumber(place, 'longitude', kto.mapx);
    case 'phone': return effectiveText(place, 'phone', kto.tel);
    case 'primaryImageUrl': return effectiveText(place, 'primaryImageUrl', kto.firstImage);
    case 'secondaryImageUrl': return effectiveText(place, 'secondaryImageUrl', kto.firstImage2);
    case 'shortDescription': return effectiveText(place, 'shortDescription', kto.contentTypeName) || '제주 관광 장소';
    case 'fullDescription': return effectiveText(place, 'fullDescription') || '상세 소개 정보가 아직 등록되지 않았습니다.';
    case 'parkingInfo': return effectiveText(place, 'parkingInfo') || '주차 정보 미확인';
    case 'businessHours': return effectiveText(place, 'businessHours') || '운영시간 미확인';
    case 'tags': return effectiveList(place, 'tags') ?? [];
    case 'recommendedPoints': {
      const stored = effectiveList(place, definition.key);
      return stored ?? effectivePetDetails(place, source)
        .filter((detail) => !['acmpyNeedMtr', 'relaAcdntRiskMtr'].includes(detail.key))
        .map((detail) => `${detail.label}: ${detail.value}`);
    }
    case 'cautionNotes': {
      const stored = effectiveList(place, definition.key);
      return stored ?? effectivePetDetails(place, source)
        .filter((detail) => ['acmpyNeedMtr', 'relaAcdntRiskMtr'].includes(detail.key))
        .map((detail) => `${detail.label}: ${detail.value}`);
    }
    default: return effectiveText(place, definition.key);
  }
}

export function adminFieldCurrentValue(definition: AdminFieldDefinition, loaded: AdminLoadedPlace): unknown {
  const place = loaded.place.data;
  if (definition.target === 'root') return currentRootValue(definition, place, loaded.source.data);
  if (definition.target === 'petPolicy') {
    const value = objectValue(place.petPolicy)[definition.key];
    if (definition.kind === 'triState') return ['TRUE', 'FALSE', 'UNKNOWN'].includes(String(value)) ? value : 'UNKNOWN';
    if (definition.kind === 'list') return stringValues(value);
    return value ?? '';
  }
  if (definition.target === 'amenities') {
    const value = objectValue(place.amenities)[definition.key];
    if (definition.kind === 'triState') return ['TRUE', 'FALSE', 'UNKNOWN'].includes(String(value)) ? value : 'UNKNOWN';
    return value ?? '';
  }
  const ktoPet = objectValue(objectValue(loaded.source.data.kto).pet);
  const overrides = objectValue(objectValue(place.adminOverrides).petDetails);
  return hasOwn(overrides, definition.key) ? trimmedText(overrides[definition.key]) : trimmedText(ktoPet[definition.key]);
}

export function adminValueToDraft(value: unknown): string {
  if (Array.isArray(value)) return value.join('\n');
  return value === null || value === undefined ? '' : String(value);
}

export function formatAdminValue(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.join(' · ') : '(없음)';
  if (value === null || value === undefined || value === '') return '(없음)';
  if (value === 'TRUE') return '예';
  if (value === 'FALSE') return '아니요';
  if (value === 'UNKNOWN') return '미확인';
  if (value === 'KTO_OVERLAY_FOUND') return 'KTO 정보 확인';
  if (value === 'ADMIN_CONFIRMED') return '관리자 확인';
  return String(value);
}

function parseList(value: string, commaSeparated: boolean): string[] {
  const parts = commaSeparated ? value.split(/[\n,]/) : value.split(/\n/);
  return [...new Set(parts.map((entry) => entry.trim()).filter(Boolean))];
}

function validUrl(value: string, instagram = false): boolean {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return !instagram || host === 'instagram.com' || host.endsWith('.instagram.com');
  } catch {
    return false;
  }
}

function parseAdminValue(definition: AdminFieldDefinition, draft: string, clear: boolean): unknown {
  if (clear) {
    if (!definition.allowClear) throw new Error(`${definition.label} 항목은 지울 수 없습니다.`);
    if (definition.kind === 'list') return [];
    if (definition.target === 'root' && definition.kind !== 'number') return '';
    return null;
  }
  const value = draft.trim();
  if (definition.kind === 'category') {
    if (!['ATTRACTION', 'CAFE', 'FOOD', 'SHOPPING', 'STAY', 'LEISURE', 'CULTURE', 'EVENT'].includes(value)) throw new Error(`${definition.label} 값을 선택해 주세요.`);
    return value;
  }
  if (definition.kind === 'region') {
    if (!['JEJU_CITY', 'SEOGWIPO_CITY', 'EAST', 'WEST'].includes(value)) throw new Error(`${definition.label} 값을 선택해 주세요.`);
    return value;
  }
  if (definition.kind === 'triState') {
    if (!['TRUE', 'FALSE', 'UNKNOWN'].includes(value)) throw new Error(`${definition.label} 값을 선택해 주세요.`);
    return value;
  }
  if (definition.kind === 'list') {
    const values = parseList(draft, definition.key === 'tags');
    if (values.length > 30 || values.some((entry) => entry.length > 200)) throw new Error(`${definition.label}은 30개 이하, 항목당 200자 이하로 입력해 주세요.`);
    if (!values.length) throw new Error(`${definition.label}을 비우려면 '값 지우기'를 선택해 주세요.`);
    return values;
  }
  if (definition.kind === 'number') {
    if (!value) throw new Error(`${definition.label}을 비우려면 '값 지우기'를 선택해 주세요.`);
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${definition.label}은 숫자로 입력해 주세요.`);
    if (definition.key === 'latitude' && (number < 32.5 || number > 34.2)) throw new Error('위도는 제주 범위(32.5~34.2)여야 합니다.');
    if (definition.key === 'longitude' && (number < 125.5 || number > 127.2)) throw new Error('경도는 제주 범위(125.5~127.2)여야 합니다.');
    if (definition.key === 'petFee' && (number < 0 || number > 1_000_000 || !Number.isInteger(number))) throw new Error('반려동물 이용요금은 0~1,000,000 사이 정수여야 합니다.');
    return number;
  }
  if (!value) throw new Error(`${definition.label}을 비우려면 '값 지우기'를 선택해 주세요.`);
  if (definition.kind === 'url' && !validUrl(value, definition.key === 'instagramUrl')) throw new Error(`${definition.label}은 유효한 http/https URL이어야 합니다.`);
  if (definition.key === 'phone' && (value.length > 30 || !/^[0-9+().\-\s]+$/.test(value))) throw new Error('전화번호 형식을 확인해 주세요.');
  const max = definition.kind === 'textarea' ? 4000 : definition.key === 'name' ? 100 : 500;
  if (value.length > max) throw new Error(`${definition.label}은 ${max}자 이하로 입력해 주세요.`);
  return value;
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildAdminEditPlan(
  loaded: AdminLoadedPlace,
  selectedIds: Iterable<string>,
  drafts: Record<string, string>,
  clearIds: Iterable<string>,
  uid: string,
): AdminEditPlan {
  if (!uid) throw new Error('관리자 로그인 상태를 확인할 수 없습니다.');
  const selected = new Set(selectedIds);
  const clears = new Set(clearIds);
  if (!selected.size) throw new Error('수정할 항목을 하나 이상 선택해 주세요.');
  const original = loaded.place.data;
  const nextPlace = structuredClone(original);
  const patch: Record<string, unknown> = {};
  const nextPolicy = structuredClone(objectValue(original.petPolicy));
  const nextAmenities = structuredClone(objectValue(original.amenities));
  const nextOverrides = structuredClone(objectValue(original.adminOverrides));
  const nextPetDetails = structuredClone(objectValue(nextOverrides.petDetails));
  const clearedFields = new Set(stringValues(objectValue(original.manualAdmin).clearedFields));
  const previousAudit = objectValue(original.manualAdmin);
  const managedFields = new Set([
    ...stringValues(previousAudit.managedFields),
    ...stringValues(previousAudit.changedFields),
    ...clearedFields,
  ]);
  const candidates: { definition: AdminFieldDefinition; before: unknown; after: unknown; clear: boolean }[] = [];

  for (const definition of ADMIN_FIELD_DEFINITIONS) {
    if (!selected.has(definition.id)) continue;
    const clear = clears.has(definition.id);
    const after = parseAdminValue(definition, drafts[definition.id] ?? '', clear);
    const before = adminFieldCurrentValue(definition, loaded);
    const visibleAfter = definition.target === 'root' && clear
      ? currentRootValue(definition, { ...original, [definition.key]: after, manualAdmin: { ...previousAudit, clearedFields: [...clearedFields, definition.id] } }, loaded.source.data)
      : definition.target === 'petDetail' && clear ? '' : after;
    if (equal(before, visibleAfter)) continue;
    if (definition.target === 'root') {
      nextPlace[definition.key] = after;
      patch[definition.key] = after;
      if (clear) clearedFields.add(definition.id); else clearedFields.delete(definition.id);
    } else if (definition.target === 'petPolicy') {
      nextPolicy[definition.key] = after;
      nextPlace.petPolicy = nextPolicy;
      patch[definition.id] = after;
    } else if (definition.target === 'amenities') {
      nextAmenities[definition.key] = after;
      nextPlace.amenities = nextAmenities;
      patch[definition.id] = after;
    } else {
      nextPetDetails[definition.key] = clear ? '' : after;
      nextOverrides.petDetails = nextPetDetails;
      nextPlace.adminOverrides = nextOverrides;
      patch[`adminOverrides.petDetails.${definition.key}`] = clear ? '' : after;
    }
    candidates.push({ definition, before, after: visibleAfter, clear });
  }

  const changes = candidates.map(({ definition, before, after, clear }) => ({
    id: definition.id,
    label: definition.label,
    before,
    after,
    cleared: clear,
  }));
  if (!changes.length) throw new Error('선택한 항목에 실제 변경값이 없습니다.');
  const petFactsChanged = changes.some(({ id }) => id.startsWith('petDetails.') || id.startsWith('petPolicy.'));
  if (petFactsChanged) {
    const beforeStatus = objectValue(original.petPolicy).petInformationStatus ?? 'UNKNOWN';
    nextPolicy.petInformationStatus = 'ADMIN_CONFIRMED';
    nextPlace.petPolicy = nextPolicy;
    if (beforeStatus !== 'ADMIN_CONFIRMED') {
      patch['petPolicy.petInformationStatus'] = 'ADMIN_CONFIRMED';
      changes.push({
        id: 'petPolicy.petInformationStatus',
        label: '반려동물 정보 상태 (자동)',
        before: beforeStatus,
        after: 'ADMIN_CONFIRMED',
        cleared: false,
      });
    }
  }

  if (changes.some(({ id }) => id === 'latitude' || id === 'longitude')) {
    const coordinatePlace = {
      ...nextPlace,
      manualAdmin: { ...previousAudit, clearedFields: [...clearedFields] },
    };
    const kto = objectValue(loaded.source.data.kto);
    const latitude = effectiveNumber(coordinatePlace, 'latitude', kto.mapy);
    const longitude = effectiveNumber(coordinatePlace, 'longitude', kto.mapx);
    const bothCleared = latitude === null && longitude === null;
    const bothValid = typeof latitude === 'number' && latitude >= 32.5 && latitude <= 34.2
      && typeof longitude === 'number' && longitude >= 125.5 && longitude <= 127.2;
    if (!bothCleared && !bothValid) throw new Error('좌표는 유효한 위도·경도를 함께 입력하거나 두 값을 함께 지워 주세요.');
  }

  if (changes.some(({ id }) => id === 'latitude' || id === 'longitude')) {
    patch.coordinateQualityStatus = 'ADMIN_CONFIRMED';
    nextPlace.coordinateQualityStatus = 'ADMIN_CONFIRMED';
  }
  const changedFields = [...new Set(changes.map(({ id }) => id))].sort();
  changedFields.forEach((id) => managedFields.add(id));
  const changedTopLevel = [...new Set(Object.keys(patch).map((key) => {
    if (key.startsWith('petPolicy.')) return 'petPolicy';
    if (key.startsWith('amenities.')) return 'amenities';
    if (key.startsWith('adminOverrides.')) return 'adminOverrides';
    return key;
  }).filter((key) => key !== 'coordinateQualityStatus'))].sort();
  const manualAdmin = {
    source: 'ADMIN_UI',
    changedFields,
    changedTopLevel,
    clearedFields: [...clearedFields].sort(),
    managedFields: [...managedFields].sort(),
  };
  nextPlace.manualAdmin = manualAdmin;
  patch.manualAdmin = manualAdmin;
  return { patch, nextPlace, changes };
}

function revisionToken(value: unknown): string {
  if (value === null || value === undefined) return 'missing';
  if (typeof value === 'object') {
    const timestamp = value as { seconds?: unknown; nanoseconds?: unknown; toMillis?: () => number };
    if (typeof timestamp.seconds === 'number' && typeof timestamp.nanoseconds === 'number') {
      return `${timestamp.seconds}:${timestamp.nanoseconds}`;
    }
    if (typeof timestamp.toMillis === 'function') return String(timestamp.toMillis());
  }
  return JSON.stringify(value);
}

export function sameAdminPlaceRevision(left: unknown, right: unknown): boolean {
  return revisionToken(left) === revisionToken(right);
}

export function applyAdminLeafPatch(place: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(place);
  for (const [path, value] of Object.entries(patch)) {
    const parts = path.split('.');
    let target = next;
    for (const part of parts.slice(0, -1)) {
      const child = objectValue(target[part]);
      target[part] = child;
      target = child;
    }
    target[parts.at(-1)!] = value;
  }
  return next;
}

export async function saveAdminPlace(
  db: Firestore,
  loaded: AdminLoadedPlace,
  plan: AdminEditPlan,
  uid: string,
): Promise<void> {
  if (!uid) throw new Error('관리자 로그인 상태를 확인할 수 없습니다.');
  const placeRef = doc(db, 'places', loaded.place.id);
  const sourceData = { ...loaded.source.data, id: loaded.source.id };
  await runTransaction(db, async (transaction) => {
    const currentSnapshot = await transaction.get(placeRef);
    if (!currentSnapshot.exists()) throw new Error('선택한 장소를 찾을 수 없습니다.');
    const currentPlace = currentSnapshot.data() as Record<string, unknown>;
    if (!sameAdminPlaceRevision(currentPlace.updatedAt, loaded.place.data.updatedAt)) {
      throw new Error('다른 관리자가 장소 정보를 변경했습니다. 재로드한 뒤 변경 내용을 다시 확인해 주세요.');
    }
    const nextPlace = applyAdminLeafPatch(currentPlace, plan.patch);
    const search = await deriveSearchFields(nextPlace, sourceData);
    const timestamp = serverTimestamp();
    const manualAdmin = { ...objectValue(plan.patch.manualAdmin), updatedAt: timestamp };
    transaction.update(placeRef, {
      ...plan.patch,
      manualAdmin,
      search: { ...search, derivedAt: timestamp },
      updatedAt: timestamp,
    });
  });
}
