import type { Place, PlaceCategory, RegionId, TriState } from '../types.ts';
import {
  SEARCH_CATEGORY_TO_UI,
  SEARCH_REGION_TO_UI,
  type PlaceSearchFields,
  type SearchCategory,
} from './searchTypes.ts';
import {
  effectiveList,
  effectiveNumber,
  effectivePetDetails,
  effectiveText,
  hasPetDetailOverrides,
  isManuallyCleared,
  normalizeHttpUrl,
  objectValue,
  stringValues,
  trimmedText,
} from './effectivePlace.ts';

export type CatalogDocument = { id: string; path: string; data: Record<string, unknown> };
export const PLACEHOLDER_IMAGE = `${import.meta.env?.BASE_URL ?? '/'}place-placeholder.svg`;
export const PET_KNOWN_LABEL = 'KTO 반려동물 정보 확인됨';
export const PET_ADMIN_LABEL = '관리자 확인 반려동물 정보';
export const PET_UNKNOWN_LABEL = '반려동물 정보 미확인';
export const PET_UNKNOWN_NOTICE = '반려동물 동반 관련 정보가 아직 확인되지 않았습니다. 동반 불가를 의미하지 않으며, 방문 전 해당 시설에 동반 가능 여부와 이용 조건을 직접 확인해 주세요.';

const record = objectValue;
const text = trimmedText;

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
  const lat = effectiveNumber(place, 'latitude', kto.mapy);
  const lng = effectiveNumber(place, 'longitude', kto.mapx);
  // Same broad Jeju bounds as import QA, including Chuja/Marado. Never correct an anomaly.
  if (place.coordinateQualityStatus === 'SOURCE_ANOMALY' || lat === null || lng === null ||
      lat < 32.5 || lat > 34.2 || lng < 125.5 || lng > 127.2) return null;
  return { lat, lng };
}

function imageUrl(value: unknown): string {
  return normalizeHttpUrl(value);
}

function triState(value: unknown): TriState {
  return value === 'TRUE' || value === 'FALSE' ? value : 'UNKNOWN';
}

function serviceCategory(value: unknown): PlaceCategory | null {
  return categoryFromSearch(text(value).toUpperCase());
}

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
  const rawStatus = policy.petInformationStatus;
  const petInformationStatus = rawStatus === 'KTO_OVERLAY_FOUND' || rawStatus === 'ADMIN_CONFIRMED'
    ? rawStatus
    : 'UNKNOWN';
  const known = petInformationStatus !== 'UNKNOWN';
  const allPetDetails = effectivePetDetails(data, source?.data ?? {});
  const petDetails = known ? allPetDetails : [];
  const adminPetInformation = petInformationStatus === 'ADMIN_CONFIRMED' || hasPetDetailOverrides(data);
  const petInformationLabel = petInformationStatus === 'ADMIN_CONFIRMED'
    ? PET_ADMIN_LABEL
    : petInformationStatus === 'KTO_OVERLAY_FOUND'
      ? (adminPetInformation ? '관리자 보완 · KTO 반려동물 정보' : PET_KNOWN_LABEL)
      : PET_UNKNOWN_LABEL;
  const search = readSearch(data);
  const name = effectiveText(data, 'name', kto.title) || document.id;
  const address = effectiveText(data, 'address', kto.addr1);
  const roadAddress = effectiveText(data, 'roadAddress', address);
  const imageFallbackUrls = [...new Set([
    imageUrl(effectiveText(data, 'primaryImageUrl', kto.firstImage)),
    imageUrl(effectiveText(data, 'secondaryImageUrl', kto.firstImage2)),
    !isManuallyCleared(data, 'primaryImageUrl') ? imageUrl(kto.firstImage) : '',
    !isManuallyCleared(data, 'secondaryImageUrl') ? imageUrl(kto.firstImage2) : '',
    PLACEHOLDER_IMAGE,
  ].filter(Boolean))];
  const searchedRegion = regionFromSearch(search?.region);
  const searchedCategory = categoryFromSearch(search?.category);
  // Prefer stored search.* (query path). Fallback keeps offline/legacy docs usable.
  const explicitRegion = regionFromSearch(text(data.regionArea));
  const regionInfo = searchedRegion ?? explicitRegion ?? regionFor(roadAddress || address, data.municipality);
  const category = searchedCategory ?? serviceCategory(data.serviceCategory) ?? categoryFor(kto.contentTypeId, kto.cat3, name);
  const fallbackRecommended = petDetails
    .filter((detail) => !['acmpyNeedMtr', 'relaAcdntRiskMtr'].includes(detail.key))
    .map((detail) => `${detail.label}: ${detail.value}`);
  const fallbackCautions = petDetails
    .filter((detail) => ['acmpyNeedMtr', 'relaAcdntRiskMtr'].includes(detail.key))
    .map((detail) => `${detail.label}: ${detail.value}`);
  return {
    id: document.id, name, address, roadAddress,
    ...regionInfo,
    category,
    shortDesc: effectiveText(data, 'shortDescription', kto.contentTypeName) || '제주 관광 장소',
    fullDesc: effectiveText(data, 'fullDescription') || '상세 소개 정보가 아직 등록되지 않았습니다.',
    contactNumber: effectiveText(data, 'phone', kto.tel),
    parkingInfo: effectiveText(data, 'parkingInfo') || '주차 정보 미확인',
    businessHours: effectiveText(data, 'businessHours') || '운영시간 미확인',
    closedDays: effectiveText(data, 'closedDays') || undefined,
    instagram: effectiveText(data, 'instagramUrl') || undefined,
    coordinates: coordinatesFor(data, kto),
    petInformationStatus,
    petInformationLabel,
    petInformationNotice: known
      ? adminPetInformation
        ? '관리자가 확인하거나 보완한 반려동물 정보입니다. 방문 전 해당 시설에 최신 이용 조건을 확인해 주세요.'
        : 'KTO에서 제공한 반려동물 관련 정보입니다. 방문 전 해당 시설에 최신 동반 가능 여부와 이용 조건을 확인해 주세요.'
      : PET_UNKNOWN_NOTICE,
    petDetails,
    petTier: search?.petTier,
    totalScore: search?.totalScore,
    petScore: search?.petScore,
    petPolicy: {
      petInformationStatus,
      petAcceptance: triState(policy.petAcceptance),
      smallDogAllowed: triState(policy.smallDogAllowed),
      mediumDogAllowed: triState(policy.mediumDogAllowed),
      largeDogAllowed: triState(policy.largeDogAllowed),
      indoorAllowed: triState(policy.indoorAllowed),
      outdoorAllowed: triState(policy.outdoorAllowed),
      carrierRequired: triState(policy.carrierRequired),
      leashRequired: triState(policy.leashRequired),
      offLeashZoneAvailable: triState(policy.offLeashZoneAvailable),
      allowedBreeds: stringValues(policy.allowedBreeds),
      allowedSizes: stringValues(policy.allowedSizes),
      sizeDescription: text(policy.sizeDescription),
      spacePolicy: text(policy.spacePolicy) || 'unknown',
      spaceDescription: text(policy.spaceDescription),
      leashDescription: text(policy.leashDescription),
      petFee: typeof policy.petFee === 'number' && Number.isFinite(policy.petFee) ? policy.petFee : null,
      petFeeDescription: text(policy.petFeeDescription),
      otherPetPolicy: text(policy.otherPetPolicy),
    },
    amenities: {
      freeParking: triState(record(data.amenities).freeParking),
      parkingDescription: text(record(data.amenities).parkingDescription),
      dogMenu: triState(record(data.amenities).dogMenu),
      waterBowlProvided: triState(record(data.amenities).waterBowlProvided),
      wasteBagsProvided: triState(record(data.amenities).wasteBagsProvided),
      fencedYard: triState(record(data.amenities).fencedYard),
      photoZone: triState(record(data.amenities).photoZone),
    },
    recommendedPoints: effectiveList(data, 'recommendedPoints') ?? fallbackRecommended,
    cautionNotes: effectiveList(data, 'cautionNotes') ?? fallbackCautions,
    imageUrl: imageFallbackUrls[0], imageFallbackUrls,
    tags: effectiveList(data, 'tags') ?? [],
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
  const known = places.filter((p) => p.petInformationStatus === 'KTO_OVERLAY_FOUND' || p.petInformationStatus === 'ADMIN_CONFIRMED').length;
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
