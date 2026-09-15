import type { Place, PlaceCategory, RegionId } from '../types.ts';
import {
  SEARCH_CATEGORY_TO_UI,
  SEARCH_REGION_TO_UI,
  type PlaceSearchFields,
  type SearchCategory,
} from './searchTypes.ts';

export type CatalogDocument = { id: string; path: string; data: Record<string, unknown> };
export const PLACEHOLDER_IMAGE = '/place-placeholder.svg';
export const PET_KNOWN_LABEL = 'KTO 반려동물 정보 확인됨';
export const PET_UNKNOWN_LABEL = '반려동물 정보 미확인';
export const PET_UNKNOWN_NOTICE = '반려동물 동반 관련 정보가 아직 확인되지 않았습니다. 동반 불가를 의미하지 않으며, 방문 전 해당 시설에 동반 가능 여부와 이용 조건을 직접 확인해 주세요.';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.map(text).filter(Boolean) : []; }

// Prefer Firestore search.category when present. Fallback mirrors Owner 8-kind rules.
export function categoryFor(contentTypeId: unknown, cat3: unknown, title: string): PlaceCategory {
  switch (String(contentTypeId)) {
    case '39':
      if (cat3 === 'A05020900') return 'cafe';
      if (text(cat3)) return 'food';
      return /카페|커피|베이커리|찻집|\bcaf[eé]\b|\bcoffee\b|\bbakery\b/i.test(title) ? 'cafe' : 'food';
    case '32': return 'stay';
    case '12': return 'attraction';
    case '14': return 'culture';
    case '15': return 'event';
    case '28': return 'leisure';
    case '38': return 'shopping';
    default: return 'attraction';
  }
}

export function categoryFromSearch(category: SearchCategory | string | undefined): PlaceCategory | null {
  if (!category || category === 'UNKNOWN') return null;
  return SEARCH_CATEGORY_TO_UI[category as Exclude<SearchCategory, 'UNKNOWN'>] ?? null;
}

export function regionFromSearch(region: string | undefined): { region: RegionId; regionName: string } | null {
  if (!region || region === 'UNKNOWN') return null;
  const ui = SEARCH_REGION_TO_UI[region as keyof typeof SEARCH_REGION_TO_UI];
  if (!ui) return null;
  const names: Record<string, string> = {
    jeju_city: '제주시', seogwipo: '서귀포시', east: '동부', west: '서부',
  };
  return { region: ui, regionName: names[ui] ?? ui };
}

function readSearch(data: Record<string, unknown>): PlaceSearchFields | null {
  const search = data.search;
  if (!search || typeof search !== 'object' || Array.isArray(search)) return null;
  const value = search as PlaceSearchFields;
  return value.version === 1 ? value : null;
}

export function regionFor(address: string, municipality: unknown): { region: RegionId; regionName: string } {
  const east = address.match(/구좌|조천|성산|표선/);
  if (east) return { region: 'east', regionName: `동부 (${east[0]})` };
  const west = address.match(/애월|한림|한경|안덕|대정/);
  if (west) return { region: 'west', regionName: `서부 (${west[0]})` };
  if (municipality === 'JEJU_CITY') return { region: 'jeju_city', regionName: '제주시' };
  if (municipality === 'SEOGWIPO_CITY') return { region: 'seogwipo', regionName: '서귀포시' };
  return { region: 'all', regionName: '지역 정보 미확인' };
}

function coordinate(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function coordinatesFor(place: Record<string, unknown>, kto: Record<string, unknown>): Place['coordinates'] {
  const lat = coordinate(place.latitude ?? kto.mapy);
  const lng = coordinate(place.longitude ?? kto.mapx);
  // Same broad Jeju bounds as import QA, including Chuja/Marado. Never correct an anomaly.
  if (place.coordinateQualityStatus === 'SOURCE_ANOMALY' || lat === null || lng === null ||
      lat < 32.5 || lat > 34.2 || lng < 125.5 || lng > 127.2) return null;
  return { lat, lng };
}

function imageUrl(value: unknown): string {
  const candidate = text(value);
  if (!/^https?:\/\//i.test(candidate)) return '';
  // KTO photo endpoints support HTTPS; avoid mixed content on the app's HTTPS page.
  return candidate.replace(/^http:/i, 'https:');
}

const PET_FIELDS = [
  ['acmpyTypeCd', '동반 유형'], ['acmpyNeedMtr', '동반 시 필요 사항'],
  ['acmpyPsblCpam', '동반 가능 동물'], ['etcAcmpyInfo', '기타 동반 안내'],
  ['relaAcdntRiskMtr', '관련 사고 위험 사항'], ['relaFrnshPrdlst', '비치 품목'],
  ['relaPosesFclty', '보유 시설'], ['relaPurcPrdlst', '구매 가능 품목'],
  ['relaRntlPrdlst', '대여 가능 품목'],
] as const;

export function adaptPlace(document: CatalogDocument, sources: CatalogDocument[] = []): Place {
  const data = document.data;
  if (data.placeId !== document.id || !/^kto-\d+$/.test(document.id)) {
    throw new Error(`Invalid catalog place ID: ${document.id}`);
  }
  // Stable preference if future multiple sources exist; only join KTO data for this place.
  const source = [...sources].filter((s) => s.data.placeId === document.id && s.data.source === 'KTO')
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  const kto = record(source?.data.kto);
  const policy = record(data.petPolicy);
  const known = policy.petInformationStatus === 'KTO_OVERLAY_FOUND';
  const pet = known ? record(kto.pet) : {};
  const petDetails = PET_FIELDS.flatMap(([key, label]) => text(pet[key]) ? [{ key, label, value: text(pet[key]) }] : []);
  const petInformationLabel = known ? PET_KNOWN_LABEL : PET_UNKNOWN_LABEL;
  const search = readSearch(data);
  const name = text(data.name) || text(kto.title) || document.id;
  const address = text(data.address) || text(kto.addr1);
  const imageFallbackUrls = [...new Set([
    imageUrl(data.primaryImageUrl), imageUrl(data.secondaryImageUrl),
    imageUrl(kto.firstImage), imageUrl(kto.firstImage2), PLACEHOLDER_IMAGE,
  ].filter(Boolean))];
  const searchedRegion = regionFromSearch(search?.region);
  const searchedCategory = categoryFromSearch(search?.category);
  // Prefer stored search.* (query path). Fallback keeps offline/legacy docs usable.
  const regionInfo = searchedRegion ?? regionFor(address, data.municipality);
  const category = searchedCategory ?? categoryFor(kto.contentTypeId, kto.cat3, name);
  return {
    id: document.id, name, address, roadAddress: text(data.roadAddress) || address,
    ...regionInfo,
    category,
    shortDesc: text(data.shortDescription) || text(kto.contentTypeName) || '제주 관광 장소',
    fullDesc: text(data.fullDescription) || '상세 소개 정보가 아직 등록되지 않았습니다.',
    contactNumber: text(data.phone) || text(kto.tel),
    parkingInfo: text(data.parkingInfo) || '주차 정보 미확인',
    businessHours: text(data.businessHours) || '운영시간 미확인',
    closedDays: text(data.closedDays) || undefined,
    coordinates: coordinatesFor(data, kto),
    petInformationStatus: known ? 'KTO_OVERLAY_FOUND' : 'UNKNOWN',
    petInformationLabel,
    petInformationNotice: known
      ? 'KTO에서 제공한 반려동물 관련 정보입니다. 방문 전 해당 시설에 최신 동반 가능 여부와 이용 조건을 확인해 주세요.'
      : PET_UNKNOWN_NOTICE,
    petDetails,
    petTier: search?.petTier,
    totalScore: search?.totalScore,
    petScore: search?.petScore,
    // Compatibility fields are deliberately conservative. UNKNOWN and free text never
    // establish a permission, a restriction, a fee, or an amenity. UI uses status/details.
    petPolicy: {
      allowedSizes: [], sizeDescription: '동반 가능 크기 미확인', spacePolicy: 'unknown',
      spaceDescription: '공간 이용 조건 미확인', leashRequired: false,
      leashDescription: '리드줄 이용 조건 미확인', offLeashZoneAvailable: false,
      petFee: null, indoorAllowed: false, outdoorAllowed: false,
    },
    amenities: {
      freeParking: false, parkingDescription: text(record(data.amenities).parkingDescription),
      dogMenu: false, waterBowlProvided: false, wasteBagsProvided: false, fencedYard: false, photoZone: false,
    },
    recommendedPoints: petDetails.filter((d) => !['acmpyNeedMtr', 'relaAcdntRiskMtr'].includes(d.key)).map((d) => `${d.label}: ${d.value}`),
    cautionNotes: petDetails.filter((d) => ['acmpyNeedMtr', 'relaAcdntRiskMtr'].includes(d.key)).map((d) => `${d.label}: ${d.value}`),
    imageUrl: imageFallbackUrls[0], imageFallbackUrls,
    tags: strings(data.tags),
  };
}

export function joinPlacesCatalog(placeDocs: CatalogDocument[], sourceDocs: CatalogDocument[]) {
  const byPlace = new Map<string, CatalogDocument[]>();
  const placeIds = new Set(placeDocs.map((p) => p.id));
  let unmatchedSources = 0;
  for (const source of sourceDocs) {
    const placeId = text(source.data.placeId);
    // Only join canonical places/{placeId}/sources/{sourceId} provenance paths.
    if (!placeIds.has(placeId) || source.path !== `places/${placeId}/sources/${source.id}`) {
      unmatchedSources++;
      continue;
    }
    const group = byPlace.get(placeId) ?? [];
    group.push(source);
    byPlace.set(placeId, group);
  }
  // Preserve query order (e.g. petSortKey DESC). Do not re-sort by name for search results.
  const places = placeDocs.map((p) => adaptPlace(p, byPlace.get(p.id) ?? []));
  const known = places.filter((p) => p.petInformationStatus === 'KTO_OVERLAY_FOUND').length;
  return {
    places,
    counts: {
      places: places.length, sources: sourceDocs.length, known, unknown: places.length - known,
      mapped: places.filter((p) => p.coordinates !== null).length,
      missingSources: placeDocs.filter((p) => !byPlace.has(p.id)).length, unmatchedSources,
    },
  };
}

/** List/map path: Place docs already carry search.*; no Source join. */
export function adaptPlaceDocs(placeDocs: CatalogDocument[]): Place[] {
  return placeDocs.map((doc) => adaptPlace(doc, []));
}

export function savedCatalogPlaces(places: Place[], savedIds: string[]): Place[] {
  const ids = new Set(savedIds);
  return places.filter((place) => ids.has(place.id));
}
