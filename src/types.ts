export type RegionId =
  | 'all'         // 전체
  | 'jeju_city'   // 제주시
  | 'seogwipo'    // 서귀포시
  | 'east'        // 동부 (구좌, 조천, 성산, 표선 등)
  | 'west';       // 서부 (애월, 한림, 한경, 안덕, 대정 등)

export interface RegionInfo {
  id: RegionId;
  name: string;
  subName: string;
  description: string;
}

export interface EventBanner {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  date?: string;
  location?: string;
  tag?: string;
  linkText?: string;
}

/** UI/search place kind. `all` = home / unset (not a Firestore category). */
export type PlaceCategory =
  | 'all'
  | 'attraction'
  | 'cafe'
  | 'food'
  | 'shopping'
  | 'stay'
  | 'leisure'
  | 'culture'
  | 'event'
  /** @deprecated legacy UI values kept for stored fixtures only */
  | 'spot'
  | 'trail';

export type DogSizeLimit = 'all' | 'small' | 'medium' | 'large'; // all sizes, under 10kg, 10-20kg, large allowed

export type SpacePolicy = 'all' | 'indoor' | 'indoor_carrier' | 'outdoor_only';

export type TriState = 'TRUE' | 'FALSE' | 'UNKNOWN';
export type PetInformationStatus = 'KTO_OVERLAY_FOUND' | 'ADMIN_CONFIRMED' | 'UNKNOWN';

export interface PetPolicy {
  petInformationStatus: PetInformationStatus;
  petAcceptance: TriState;
  smallDogAllowed: TriState;
  mediumDogAllowed: TriState;
  largeDogAllowed: TriState;
  indoorAllowed: TriState;
  outdoorAllowed: TriState;
  carrierRequired: TriState;
  leashRequired: TriState;
  offLeashZoneAvailable: TriState;
  allowedBreeds: string[];
  allowedSizes: string[];
  sizeDescription: string;
  spacePolicy: string;
  spaceDescription: string;
  leashDescription: string;
  petFee: number | null;
  petFeeDescription: string;
  otherPetPolicy: string;
}

export interface PlaceAmenities {
  freeParking: TriState;
  parkingDescription: string;
  dogMenu: TriState; // 멍푸치노, 수제간식
  waterBowlProvided: TriState; // 물그릇 제공
  wasteBagsProvided: TriState; // 배변봉투 비치
  fencedYard: TriState; // 펜스 운동장
  photoZone: TriState; // 반려견 포토존
}

export interface Place {
  id: string;
  name: string;
  category: PlaceCategory;
  region: RegionId;
  regionName: string;
  shortDesc: string;
  fullDesc: string;
  address: string;
  roadAddress: string;
  parkingInfo: string;
  businessHours: string;
  closedDays?: string;
  contactNumber: string;
  instagram?: string;
  coordinates: {
    lat: number;
    lng: number;
  } | null;
  petPolicy: PetPolicy;
  amenities: PlaceAmenities;
  cautionNotes: string[];
  recommendedPoints: string[];
  imageUrl: string;
  tags: string[];
  petInformationStatus?: PetInformationStatus;
  petInformationLabel?: string;
  petInformationNotice?: string;
  petDetails?: { key: string; label: string; value: string; source: 'ADMIN' | 'KTO' }[];
  imageFallbackUrls?: string[];
  petTier?: 'RICH' | 'PARTIAL' | 'BASIC' | 'UNKNOWN';
  totalScore?: number;
  petScore?: number;
}

export interface FilterState {
  region: RegionId;
  category: PlaceCategory;
  dogSize: 'any' | 'small' | 'medium' | 'large';
  indoorAllowedOnly: boolean;
  freeParkingOnly: boolean;
  offLeashYardOnly: boolean;
  dogMenuOnly: boolean;
  searchQuery: string;
}
