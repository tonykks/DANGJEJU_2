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
  id: string;              // contentId
  contentId?: string;      // 한국관광공사 콘텐츠 ID
  name: string;            // 장소명 (title)
  title?: string;          // 공공데이터 원본 타이틀
  category: PlaceCategory;
  region: RegionId;
  regionName: string;
  shortDesc: string;
  fullDesc: string;
  address: string;         // 기본 주소 + 상세 주소
  detailAddress?: string;  // 상세 주소
  roadAddress: string;
  parkingInfo: string;
  businessHours: string;
  closedDays?: string;
  contactNumber: string;
  instagram?: string;
  imageUrl: string;        // 대표 이미지 (image 또는 thumbnail 또는 기본값)
  image?: string;          // 원본 대형 이미지
  thumbnail?: string;      // 원본 썸네일 이미지
  coordinates: {
    lat: number;
    lng: number;
  } | null;
  petPolicy: PetPolicy;
  amenities: PlaceAmenities;
  cautionNotes: string[];
  recommendedPoints: string[];
  tags: string[];
  petInformationStatus?: PetInformationStatus;
  petInformationLabel?: string;
  petInformationNotice?: string;
  petDetails?: { key: string; label: string; value: string; source: 'ADMIN' | 'KTO' }[];
  imageFallbackUrls?: string[];
  petTier?: 'RICH' | 'PARTIAL' | 'BASIC' | 'UNKNOWN';
  totalScore?: number;
  petScore?: number;

  // 공공데이터 TourAPI 4.0 반려동물 전용 정보 (detailPetTour2)
  petType?: string;          // 동반 가능 구역 (예: 전구역 동반가능, 일부구역 동반가능)
  petAllowed?: string;       // 동반 가능 견종/범위 (예: 전 견종 동반 가능, 9kg 이하 등)
  petNeed?: string;          // 필수사항 (예: 목줄 착용, 입마개 착용, 이동장 사용 등)
  petInfo?: string;          // 주의사항 / 기타 안내
  petRisk?: string;          // 위험/주의 정보 (훈련사 상시대기, 동의서 작성 등)
  petFacilities?: string;    // 반려동물 관련시설
  petProvidedItems?: string; // 비치품목
  petPurchaseItems?: string; // 구매가능 품목
  petIndoorInfo?: string;    // 실내 관련 안내
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
