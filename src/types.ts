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

export type PlaceCategory = 'all' | 'cafe' | 'spot' | 'food' | 'trail' | 'stay';

export type DogSizeLimit = 'all' | 'small' | 'medium' | 'large'; // all sizes, under 10kg, 10-20kg, large allowed

export type SpacePolicy = 'all' | 'indoor' | 'indoor_carrier' | 'outdoor_only';

export interface PetPolicy {
  allowedSizes: ('small' | 'medium' | 'large')[];
  sizeDescription: string; // e.g. "대형견(25kg)까지 전견종 가능" or "10kg 미만 소형견만 가능"
  spacePolicy: 'unknown' | 'indoor_free' | 'indoor_carrier' | 'outdoor_terrace_only' | 'outdoor_and_indoor';
  spaceDescription: string; // e.g. "실내 1층 목줄 착용 시 동반 가능, 2층은 노펫존"
  leashRequired: boolean;
  leashDescription: string; // e.g. "리드줄(2m 이내) 필수 착용"
  offLeashZoneAvailable: boolean; // 천연잔디 오프리쉬 운동장 유무
  petFee: number | null; // 0 = free, or e.g. 5000 won
  petFeeDescription?: string;
  indoorAllowed: boolean;
  outdoorAllowed: boolean;
}

export interface PlaceAmenities {
  freeParking: boolean;
  parkingDescription: string;
  dogMenu: boolean; // 멍푸치노, 수제간식
  waterBowlProvided: boolean; // 물그릇 제공
  wasteBagsProvided: boolean; // 배변봉투 비치
  fencedYard: boolean; // 펜스 운동장
  photoZone: boolean; // 반려견 포토존
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
  petInformationStatus?: 'KTO_OVERLAY_FOUND' | 'UNKNOWN';
  petInformationLabel?: string;
  petInformationNotice?: string;
  petDetails?: { key: string; label: string; value: string }[];
  imageFallbackUrls?: string[];
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
