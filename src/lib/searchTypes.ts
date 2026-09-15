/** Search taxonomy stored on Place.search (Firestore). */
export type SearchRegion = 'JEJU_CITY' | 'SEOGWIPO_CITY' | 'EAST' | 'WEST' | 'UNKNOWN';
export type SearchCategory =
  | 'ATTRACTION' | 'CAFE' | 'FOOD' | 'SHOPPING' | 'STAY' | 'LEISURE' | 'CULTURE' | 'EVENT' | 'UNKNOWN';
export type PetTier = 'RICH' | 'PARTIAL' | 'BASIC' | 'UNKNOWN';

export type PlaceSearchFields = {
  version: 1;
  region: SearchRegion;
  category: SearchCategory;
  regionBasis?: string;
  categoryBasis?: string;
  basicScore: number;
  petScore: number;
  totalScore: number;
  scoreVersion: string;
  petTier: PetTier;
  petSortKey: number;
  primarySourceId: string;
  inputHash?: string;
};

export const HERO_TOTAL_SCORE_MIN = 12;
export const HERO_LIMIT = 5;
export const SEARCH_VERSION = 1;

export const SEARCH_CATEGORY_LABEL: Record<Exclude<SearchCategory, 'UNKNOWN'>, string> = {
  ATTRACTION: '관광지',
  CAFE: '카페',
  FOOD: '음식점',
  SHOPPING: '쇼핑',
  STAY: '숙박',
  LEISURE: '레포츠',
  CULTURE: '문화시설',
  EVENT: '축제·공연·행사',
};

export const SEARCH_REGION_TO_UI = {
  JEJU_CITY: 'jeju_city',
  SEOGWIPO_CITY: 'seogwipo',
  EAST: 'east',
  WEST: 'west',
} as const;

export const UI_REGION_TO_SEARCH = {
  jeju_city: 'JEJU_CITY',
  seogwipo: 'SEOGWIPO_CITY',
  east: 'EAST',
  west: 'WEST',
} as const;

export const SEARCH_CATEGORY_TO_UI = {
  ATTRACTION: 'attraction',
  CAFE: 'cafe',
  FOOD: 'food',
  SHOPPING: 'shopping',
  STAY: 'stay',
  LEISURE: 'leisure',
  CULTURE: 'culture',
  EVENT: 'event',
} as const;

export const UI_CATEGORY_TO_SEARCH = {
  attraction: 'ATTRACTION',
  cafe: 'CAFE',
  food: 'FOOD',
  shopping: 'SHOPPING',
  stay: 'STAY',
  leisure: 'LEISURE',
  culture: 'CULTURE',
  event: 'EVENT',
} as const;
