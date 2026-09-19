import {
  PET_DETAIL_FIELDS,
  effectiveNumber,
  effectivePetDetails,
  effectiveText,
  objectValue,
  stringValues,
  trimmedText,
} from './effectivePlace';
import { SEARCH_VERSION, type PetTier, type PlaceSearchFields, type SearchCategory, type SearchRegion } from './searchTypes';

export const SCORE_VERSION = 'hank-place-field-audit-v1';

const PLACEHOLDER_TOKENS = new Set([
  'unknown', 'null', 'none', 'undefined', 'n/a', 'na', '-', '--', 'placeholder',
  '미확인', '정보 없음', '정보없음', '미제공', '확인 필요', '확인필요', '미등록', '등록 예정',
]);
const UI_DEFAULT_TEXTS = new Set([
  '제주 관광 장소', '상세 소개 정보가 아직 등록되지 않았습니다.', '주차 정보 미확인',
  '운영시간 미확인', '주소 미확인', '연락처 미확인', '지역 정보 미확인',
]);
const SHORT_DESC_REJECT = new Set([
  '12', '14', '15', '28', '32', '38', '39', '관광지', '문화시설', '축제공연행사', '레포츠',
  '숙박', '쇼핑', '음식점', 'all', 'cafe', 'spot', 'food', 'trail', 'stay', '카페', '숙소', '산책로',
]);
const CONTENT_TYPE_LABELS: Record<string, string> = {
  '12': '관광지', '14': '문화시설', '15': '축제공연행사', '28': '레포츠',
  '32': '숙박', '38': '쇼핑', '39': '음식점',
};
const CAFE_TITLE_RE = /카페|커피|베이커리|찻집|\bcaf[eé]\b|\bcoffee\b|\bbakery\b/i;
const CATEGORIES = new Set<SearchCategory>(['ATTRACTION', 'CAFE', 'FOOD', 'SHOPPING', 'STAY', 'LEISURE', 'CULTURE', 'EVENT', 'UNKNOWN']);
const REGIONS = new Set<SearchRegion>(['JEJU_CITY', 'SEOGWIPO_CITY', 'EAST', 'WEST', 'UNKNOWN']);

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = { nbsp: '\u00a0', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return value
    .replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi, (entity, hex: string | undefined, decimal: string | undefined) => {
      const point = Number.parseInt(hex ?? decimal ?? '', hex ? 16 : 10);
      try { return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity; }
      catch { return entity; }
    })
    .replace(/&(nbsp|amp|lt|gt|quot|apos);/gi, (_, name: string) => named[name.toLowerCase()]);
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, ' ')
    .normalize('NFC')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized;
}

function placeholder(value: string | null): boolean {
  return !value || PLACEHOLDER_TOKENS.has(value.toLocaleLowerCase('en-US')) || UI_DEFAULT_TEXTS.has(value);
}

function contentTypeId(value: unknown): string | null {
  if (typeof value === 'boolean' || value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value);
  return trimmedText(value) || null;
}

function validHttpUrl(value: unknown): boolean {
  const candidate = trimmedText(value);
  if (!candidate || /\s/.test(candidate)) return false;
  try {
    const parsed = new URL(candidate.replace(/^http:/i, 'https:'));
    return ['http:', 'https:'].includes(parsed.protocol) && Boolean(parsed.hostname)
      && parsed.pathname !== '/place-placeholder.svg';
  } catch {
    return false;
  }
}

function deriveRegion(place: Record<string, unknown>, kto: Record<string, unknown>): [SearchRegion, string] {
  const explicit = trimmedText(place.regionArea) as SearchRegion;
  if (REGIONS.has(explicit) && explicit !== 'UNKNOWN') return [explicit, 'SERVICE_REGION'];
  const address = effectiveText(place, 'roadAddress') || effectiveText(place, 'address', kto.addr1);
  if (/구좌|조천|성산|표선/.test(address)) return ['EAST', 'ADDRESS_EAST'];
  if (/애월|한림|한경|안덕|대정/.test(address)) return ['WEST', 'ADDRESS_WEST'];
  if (place.municipality === 'JEJU_CITY') return ['JEJU_CITY', 'MUNICIPALITY'];
  if (place.municipality === 'SEOGWIPO_CITY') return ['SEOGWIPO_CITY', 'MUNICIPALITY'];
  return ['UNKNOWN', 'UNKNOWN'];
}

function deriveCategory(place: Record<string, unknown>, kto: Record<string, unknown>, title: string): [SearchCategory, string] {
  const service = trimmedText(place.serviceCategory).toUpperCase() as SearchCategory;
  if (CATEGORIES.has(service) && service !== 'UNKNOWN') return [service, 'SERVICE_CATEGORY'];
  const cid = contentTypeId(kto.contentTypeId);
  const mapping: Partial<Record<string, SearchCategory>> = {
    '12': 'ATTRACTION', '14': 'CULTURE', '15': 'EVENT', '28': 'LEISURE', '32': 'STAY', '38': 'SHOPPING',
  };
  if (cid && mapping[cid]) return [mapping[cid]!, 'KTO_CONTENT_TYPE'];
  if (cid !== '39') return ['UNKNOWN', 'UNKNOWN'];
  if (kto.cat3 === 'A05020900') return ['CAFE', 'KTO_CAT3'];
  if (trimmedText(kto.cat3)) return ['FOOD', 'KTO_CAT3'];
  return CAFE_TITLE_RE.test(title) ? ['CAFE', 'TITLE_FALLBACK'] : ['FOOD', 'TITLE_FALLBACK'];
}

function petTier(status: string, petScore: number): PetTier {
  if (status === 'UNKNOWN') return 'UNKNOWN';
  if (petScore >= 5) return 'RICH';
  if (petScore >= 2) return 'PARTIAL';
  return 'BASIC';
}

export function petSortKey(tier: PetTier, petScore: number, basicScore: number): number {
  const rank = { RICH: 3, PARTIAL: 2, BASIC: 1, UNKNOWN: 0 }[tier];
  return rank * 10000 + petScore * 100 + basicScore;
}

function presentScores(place: Record<string, unknown>, source: Record<string, unknown>) {
  const kto = objectValue(source.kto);
  const placeId = trimmedText(place.placeId);
  let basicScore = 0;
  const add = (condition: boolean) => { if (condition) basicScore += 1; };
  const displayName = normalizeText(effectiveText(place, 'name', kto.title));
  add(Boolean(displayName) && displayName !== placeId && !placeholder(displayName));

  const code = contentTypeId(kto.contentTypeId);
  const typeName = normalizeText(kto.contentTypeName);
  add(Boolean(code && typeName && CONTENT_TYPE_LABELS[code] === typeName && !placeholder(typeName)));

  const address = normalizeText(effectiveText(place, 'roadAddress') || effectiveText(place, 'address', kto.addr1));
  add(Boolean(address) && !placeholder(address));
  const addr2 = normalizeText(kto.addr2);
  add(Boolean(addr2) && !placeholder(addr2) && !address?.includes(addr2!));

  const latitude = effectiveNumber(place, 'latitude', kto.mapy);
  const longitude = effectiveNumber(place, 'longitude', kto.mapx);
  add(place.coordinateQualityStatus !== 'SOURCE_ANOMALY' && latitude !== null && longitude !== null
    && latitude >= 32.5 && latitude <= 34.2 && longitude >= 125.5 && longitude <= 127.2);

  const phone = normalizeText(effectiveText(place, 'phone', kto.tel));
  add(Boolean(phone) && !placeholder(phone));
  add([
    effectiveText(place, 'primaryImageUrl', kto.firstImage),
    effectiveText(place, 'secondaryImageUrl', kto.firstImage2),
  ].some(validHttpUrl));

  const shortDescription = normalizeText(effectiveText(place, 'shortDescription'));
  const serviceCategory = normalizeText(place.serviceCategory);
  add(Boolean(shortDescription) && !placeholder(shortDescription) && !SHORT_DESC_REJECT.has(shortDescription!)
    && shortDescription !== typeName && shortDescription !== serviceCategory);
  const fullDescription = normalizeText(effectiveText(place, 'fullDescription'));
  const shortOk = Boolean(shortDescription) && !placeholder(shortDescription) && !SHORT_DESC_REJECT.has(shortDescription!);
  add(Boolean(fullDescription) && !placeholder(fullDescription) && !(shortOk && fullDescription === shortDescription));

  for (const key of ['parkingInfo', 'businessHours', 'closedDays']) {
    const value = normalizeText(effectiveText(place, key));
    add(Boolean(value) && !placeholder(value));
  }
  const instagram = effectiveText(place, 'instagramUrl');
  let instagramOk = false;
  if (validHttpUrl(instagram)) {
    const host = new URL(instagram).hostname.toLowerCase();
    instagramOk = host === 'instagram.com' || host.endsWith('.instagram.com');
  }
  add(instagramOk);
  add(stringValues(place.tags).some((tag) => !placeholder(normalizeText(tag))));
  const zip = normalizeText(kto.zipcode);
  add(Boolean(zip) && !placeholder(zip));

  const status = trimmedText(objectValue(place.petPolicy).petInformationStatus) || 'UNKNOWN';
  if (!['UNKNOWN', 'KTO_OVERLAY_FOUND', 'ADMIN_CONFIRMED'].includes(status)) {
    throw new Error(`Invalid pet information status for ${placeId}`);
  }
  const collectorJoin = objectValue(source.collector).hasPetJoin;
  const sourcePet = kto.pet;
  if (status === 'KTO_OVERLAY_FOUND' && (collectorJoin !== 'Y' || !sourcePet || typeof sourcePet !== 'object' || Array.isArray(sourcePet))) {
    throw new Error(`Pet source mismatch for ${placeId}`);
  }
  if (status === 'UNKNOWN' && (collectorJoin !== 'N' || (sourcePet !== null && sourcePet !== undefined))) {
    throw new Error(`Pet source mismatch for ${placeId}`);
  }
  const petScore = status === 'UNKNOWN' ? 0 : effectivePetDetails(place, source)
    .filter((detail) => !placeholder(normalizeText(detail.value))).length;
  return { basicScore, petScore, status, displayName: displayName || placeId };
}

function firestoreTimestampIso(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const timestamp = value as { seconds?: unknown; nanoseconds?: unknown; toDate?: unknown; toMillis?: unknown };
  if (typeof timestamp.seconds !== 'number' || !Number.isInteger(timestamp.seconds)
    || typeof timestamp.nanoseconds !== 'number' || !Number.isInteger(timestamp.nanoseconds)
    || timestamp.nanoseconds < 0 || timestamp.nanoseconds >= 1_000_000_000
    || (typeof timestamp.toDate !== 'function' && typeof timestamp.toMillis !== 'function')) return null;
  const base = new Date(timestamp.seconds * 1000).toISOString().replace(/\.000Z$/, '');
  if (timestamp.nanoseconds === 0) return `${base}Z`;
  const fraction = String(timestamp.nanoseconds).padStart(9, '0').replace(/0+$/, '');
  return `${base}.${fraction}Z`;
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const timestamp = firestoreTimestampIso(value);
  if (timestamp) return JSON.stringify(timestamp);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalStringify(entry)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`).join(',')}}`;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

function pick(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, source[key] ?? null]));
}

export async function deriveSearchFields(
  place: Record<string, unknown>,
  source: Record<string, unknown>,
): Promise<PlaceSearchFields> {
  const kto = objectValue(source.kto);
  const { basicScore, petScore, status, displayName } = presentScores(place, source);
  const [region, regionBasis] = deriveRegion(place, kto);
  const [category, categoryBasis] = deriveCategory(place, kto, displayName);
  const tier = petTier(status, petScore);
  const primarySourceId = trimmedText(source.placeSourceId) || trimmedText(source.id);
  if (!primarySourceId || primarySourceId.includes('/')) throw new Error('Invalid primarySourceId');
  const input = {
    placeKeys: {
      ...pick(place, [
        'placeId', 'name', 'address', 'roadAddress', 'municipality', 'regionArea', 'latitude', 'longitude',
        'coordinateQualityStatus', 'phone', 'primaryImageUrl', 'secondaryImageUrl', 'shortDescription',
        'fullDescription', 'parkingInfo', 'businessHours', 'closedDays', 'instagramUrl', 'tags',
        'serviceCategory', 'petPolicy', 'adminOverrides',
      ]),
      manualClearedFields: [...new Set(stringValues(objectValue(place.manualAdmin).clearedFields))].sort(),
    },
    sourceKeys: pick(source, ['placeSourceId', 'placeId', 'source', 'collector', 'kto']),
    scoreVersion: SCORE_VERSION,
    searchVersion: SEARCH_VERSION,
  };
  const inputHash = await sha256(canonicalStringify(input));
  return {
    version: SEARCH_VERSION,
    region,
    category,
    regionBasis,
    categoryBasis,
    basicScore,
    petScore,
    totalScore: basicScore + petScore,
    scoreVersion: SCORE_VERSION,
    petTier: tier,
    petSortKey: petSortKey(tier, petScore, basicScore),
    primarySourceId,
    inputHash,
  };
}

export const SEARCH_DERIVATION_PET_KEYS = PET_DETAIL_FIELDS.map(([key]) => key);
