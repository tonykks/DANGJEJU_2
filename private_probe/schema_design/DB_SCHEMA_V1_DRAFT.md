# DANGJEJU_2 — DB Schema V1 초안

작성: 지니(통합). 1차 설계 행크, 독립 Review 애니.
기준 데이터: `private_probe/20260911T143232Z/` 정상 Run.
범위: 기술 중립 논리 설계. 실제 DB 생성, Import, App 수정, Commit/Push 없음.

이 문서는 행크 초안(`HANK_SCHEMA_DRAFT.md`)을 정본으로 삼고, 애니 `CONDITIONAL PASS` 조건(D-2~D-11, R-1~R-9)을 반영한 **통합 V1**이다. 행크 원본과 애니 리뷰 파일은 그대로 둔다.

---

## 0. 통합 메모

- 애니 판정: **CONDITIONAL PASS**. blocker 없음.
- 반영한 조건: Entity 정의 보강, 그룹 재집계, 주소 규칙, `event.dateText`, PetPolicy 부재 해석, `spacePolicy` 쟁점 등록, Firestore 쿼리 제약 기록, sample 원천 보강.
- 모델 배정: 이 세션 Task 목록에 Codex Astra / agy·Gemini가 없어 행크=`gpt-5.6-sol-medium`, 애니=`claude-opus-5-thinking-high`.
- Owner/Toby 승인 전 실제 DB 구축을 시작하지 않는다.

---

## 1. 설계 목표

1. 제주 KTO 장소 2,126건을 `contentId` 단위로 손실 없이 보존한다.
2. KTO Pet 교집합 330건을 장소 카탈로그 위의 **출처 한정 오버레이**로 표현한다. 1,796건은 불가가 아니라 미확인이다.
3. KTO 원천 분류와 댕제주 서비스 분류를 분리한다.
4. 앱이 요구하는 장소·반려견 정책·편의시설 필드를 현재 값이 없어도 보존한다.
5. 모든 정책성 boolean에서 `unknown`과 `false`를 구분한다.
6. KTO, VisitJeju, TeamResearch, OwnerInput, UserReport, 기타 공공데이터를 출처·시점·검증 상태와 함께 수용한다.
7. 검색/필터 핵심 필드는 정식 필드로 두고, 불확실한 확장 속성만 제한적으로 `extraAttributes`에 둔다.
8. 교육용 팀 프로젝트에서 이해하고 구현할 수 있는 수준으로 유지한다.

### 비목표

- 실제 DB 또는 Firestore 생성, 데이터 Import, 보안 규칙 설계
- 같은 제목·주소·좌표를 근거로 한 자동 중복 병합
- KTO 결측값의 추정 보완
- KTO `has_pet=N`을 반려동물 출입 불가로 변환
- `acmpyTypeCd`를 실내/야외/캐리어 정책으로 변환
- 주소 문자열만으로 동부/서부 값을 즉시 확정
- 기존 `src/data/places.ts` 값을 사실 데이터로 사용
- KTO Pet ∩ 제주 음식점 1건을 “제주 펫 식당 1개”로 해석

---

## 2. 핵심 용어와 상태

### 논리 타입

- `Id`: 시스템이 부여하는 불변 문자열 식별자.
- `SourceId`: 출처가 부여한 문자열 식별자. 숫자처럼 보여도 문자열로 저장한다.
- `Text`, `Text[]`, `Url`, `Integer`, `Decimal`, `MoneyKRW`.
- `LocalDate`, `Instant`: 날짜와 시각을 구분한다.
- `GeoPoint`: `{ latitude: Decimal, longitude: Decimal }`.
- `TriState`: `TRUE | FALSE | UNKNOWN`. `FALSE`는 확인된 불가/미제공만 뜻한다.
- `PetInformationStatus`: `KTO_OVERLAY_FOUND | UNKNOWN`. JOIN `Y/N`을 의미 왜곡 없이 전달한다.
- `VerificationStatus`: `UNVERIFIED | VERIFIED | DISPUTED | REJECTED | STALE`.
- `RelationStatus`: `SUGGESTED | CONFIRMED | REJECTED`.
- `ServiceCategory`: 팀 승인 후 관리하는 서비스 분류. KTO 코드와 별도 사전이다.
- `RegionArea`: `JEJU_CITY | SEOGWIPO_CITY | EAST | WEST | OTHER_JEJU | UNKNOWN`.
- `CoordinateQualityStatus`: `OK | SOURCE_ANOMALY | MISSING`.
- `PublicationStatus`: `DRAFT | PUBLISHED | HIDDEN`.

### null / unknown 정책

- 일반 문자열·숫자·URL이 관측되지 않았으면 `null`. 빈 문자열은 적재 시 `null`로 정규화할 수 있으나 원문은 Source Record에 보존한다.
- 정책 판단은 `TriState`. 미수집은 `UNKNOWN`, 확인된 불가는 `FALSE`, 확인된 가능은 `TRUE`.
- 금액 `0`은 확인된 무료, `null`은 모름.
- 빈 배열을 “불가/없음”으로 쓰지 않는다. 정책 목록은 `null` 또는 별도 상태와 함께 쓴다.
- **PetPolicy 또는 AmenityProfile 레코드가 없으면 해당 객체의 모든 정책 필드는 `UNKNOWN`(텍스트는 `null`)으로 읽는다.**
- UI는 `null`, `UNKNOWN`, 검증 거절 값을 기본적으로 숨길 수 있다.

---

## 3. Entity

논리 Entity 9종 + 적재 별칭 1종(비저장).

`placeContent`는 V1에서 `Place`에 포함한다. `PetPolicy`와 `AmenityProfile`은 tri-state가 많고 독립 검증이 필요해 분리한다.

### 3.1 Place

- 목적: 사용자에게 보여주는 장소의 정제된 현재 표현.
- Key: `placeId`.
- 주요 필드:
  - 기본: `name`, `serviceCategory`, `shortDescription`, `fullDescription`
  - 위치: `address`, `roadAddress`, `latitude`, `longitude`, `coordinateQualityStatus`
  - 지역: `municipality`, `regionArea`, `regionName`
  - 운영: `parkingInfo`, `businessHours`, `closedDays`, `phone`, `instagramUrl`
  - 콘텐츠: `primaryImageUrl`, `secondaryImageUrl`, `tags`, `recommendedPoints`, `cautionNotes`
  - 관계: `placeGroupId?`, `parentPlaceId?`, `relatedPlaceIds?`
  - 상태: `publicationStatus`, `createdAt`, `updatedAt`
  - 확장: `extraAttributes?` — 검색 핵심을 넣지 않는 저빈도 속성만
- 관계: `Place 1:N PlaceSourceRecord`, `Place 0..1 PetPolicy`, `Place 0..1 AmenityProfile`, `Place 0..N EventBanner`, `Place 0..N Favorite`, `Place 0..N PlaceRelation`.

주소 규칙 (애니 D-4 반영):

- `place.address` 초기값 = KTO `addr1`만.
- `addr2`는 `PlaceSourceRecord`에 원문 보존.
- UI가 `addr1 + addr2`를 붙여 보여줄 수는 있다. 그것은 표시 규칙이지 저장 규칙이 아니다.
- KTO `addr1` 자체에 `(노형동)`이 들어 있는 경우도 있어 원천이 일관되지 않다. 보정하지 않는다.

### 3.2 PlaceSourceRecord

- 목적: 외부 출처 한 건을 원래 의미와 식별자로 보존하고 서비스 필드의 근거를 제공한다.
- Key: `placeSourceId`.
- Natural uniqueness 후보: `(source, sourceDataset, sourceId)`.
- Envelope: `source`, `sourceDataset`, `sourceId`, `sourceUpdatedAt`, `importedAt`, `verifiedAt`, `verificationStatus`.
- KTO 장소 관측값: `contentId`, `title`, `contentTypeId`, `lclsSystm1/2/3`, `cat1/2/3`, 주소, 좌표, 이미지, 저작권, 전화, 생성·수정시각, `mlevel`, `zipcode` 등.
- KTO Pet 관측값: `acmpyTypeCd`, `acmpyNeedMtr`, `acmpyPsblCpam`, `etcAcmpyInfo`, `rela*`.
- `rawReference`: 원천 파일/레코드 추적용. 원문 전체를 서비스 JSON으로 복제하지 않는다.
- 한 Place가 여러 출처 Record를 가질 수 있다. 새 출처는 기존 KTO 레코드를 덮어쓰지 않는다.

### 3.3 PetPolicy

- 목적: 여러 출처를 검토해 만든 댕제주 서비스용 반려견 정책. KTO Pet 원문과 동일하지 않다.
- Key: `placeId` (1:1 공유 키) 또는 `petPolicyId`.
- 주요 필드: `petInformationStatus`, `petAcceptance`, 견종/체급, 실내/야외/캐리어, 공간 정책, 목줄, 오프리쉬, 입장료, `otherPetPolicy`, provenance.
- 모든 가능/불가 필드는 `TriState`.
- KTO `acmpyTypeCd=전구역 동반가능`만으로 `indoorAllowed=TRUE` 또는 `petAcceptance=TRUE`를 만들지 않는다.
- JOIN `has_pet=N` → `petInformationStatus=UNKNOWN`. `petAcceptance=FALSE` 금지.
- 레코드 부재 = 전 필드 UNKNOWN.

### 3.4 AmenityProfile

- 목적: 장소·반려견 편의시설의 서비스용 구조화 상태.
- Key: `placeId` (1:1) 또는 `amenityProfileId`.
- 필드: `freeParking`, `parkingDescription`, `dogMenu`, `waterBowlProvided`, `wasteBagsProvided`, `fencedYard`, `photoZone`.
- boolean 성격은 `TriState`. KTO `rela*` 자유 텍스트를 자동 확정 변환하지 않는다.
- 레코드 부재 = 전 필드 UNKNOWN.

### 3.5 EventBanner

- 목적: 기간·노출 순서가 있는 이벤트/배너. 장소의 영속 속성과 분리한다.
- Key: `eventId`.
- 필드: `eventType`, `badge`, `title`, `subtitle`, `imageUrl`, `dateText`, `startAt`, `endAt`, `locationText`, `tag`, `linkUrl`, `linkText`, `relatedPlaceIds`, `displayOrder`, `publicationStatus`, provenance.
- `dateText`는 앱 `EventBanner.date`를 보존한다. `'상시 운영'`처럼 Instant 구간으로 담을 수 없는 값을 위한 자유 텍스트다. `startAt`/`endAt`과 병행한다.
- 장소 없는 전역 배너도 허용한다.

### 3.6 User (자리만)

- Key: `userId`.
- 자리: `authProviderId`, `displayName`, `createdAt`, `updatedAt`, `status`.
- 이번 단계 미구현.

### 3.7 Favorite (자리만)

- Key: `(userId, placeId)` 또는 `favoriteId`.
- 필드: `userId`, `placeId`, `createdAt`.
- 이번 단계 미구현.

### 3.8 PlaceRelation

- 목적: 복수 `contentId` / 복합시설의 **제안·확정·거절** 관계를 사람 확인 절차와 함께 남긴다. 자동 병합하지 않는다.
- Key: `relationId`.
- 필드: `leftPlaceId`, `rightPlaceId`, `placeGroupId?`, `relationType`(`SAME_PLACE_CANDIDATE` | `PARENT_CHILD` | `RELATED`), `relationStatus`, `relationReason`, `reviewedBy`, `reviewedAt`.
- CONFIRMED 전에 사용자 화면에서 한 장소로 묶지 않는다.
- 그룹화해도 Source Record와 contentId는 삭제·이동·덮어쓰기하지 않는다.

### 3.9 RegionCodeReference

- 목적: KTO `ldongCode2` 코드표 조회. 장소 행을 대체하지 않는다.
- Key: `code`.
- 필드: `code`, `name`, `rnum`.
- 제주 시 단위는 `110` 제주시, `130` 서귀포시만 현재 목록에 쓴다.

### 3.10 ImportMapping (비저장)

- JOIN CSV의 `pet_*` 접두사 컬럼 별칭이다.
- 스키마에 중복 저장하지 않는다. 적재 시 `placeSource.kto.pet.*`로 매핑한다.
- Matrix `group=ALIAS`. Owner 필드 집계에서 제외한다.

---

## 4. Mermaid ER

```mermaid
erDiagram
    PLACE ||--o{ PLACE_SOURCE_RECORD : "근거를 가짐"
    PLACE ||--o| PET_POLICY : "서비스 정책"
    PLACE ||--o| AMENITY_PROFILE : "편의시설"
    PLACE }o--o{ EVENT_BANNER : "선택적 연결"
    PLACE ||--o{ FAVORITE : "찜 대상"
    USER ||--o{ FAVORITE : "찜 생성"
    PLACE ||--o{ PLACE_RELATION : "그룹 후보"
    REGION_CODE_REFERENCE ||--o{ PLACE_SOURCE_RECORD : "시군구 코드 참조"

    PLACE {
      Id placeId PK
      Text name
      ServiceCategory serviceCategory
      RegionArea regionArea
      Text address
      Decimal latitude
      Decimal longitude
      Enum coordinateQualityStatus
    }
    PLACE_SOURCE_RECORD {
      Id placeSourceId PK
      Id placeId FK
      Text source
      SourceId sourceId
      Instant sourceUpdatedAt
      Instant importedAt
      VerificationStatus verificationStatus
    }
    PET_POLICY {
      Id placeId PK_FK
      PetInformationStatus petInformationStatus
      TriState petAcceptance
      TriState indoorAllowed
      TriState leashRequired
    }
    AMENITY_PROFILE {
      Id placeId PK_FK
      TriState freeParking
      TriState dogMenu
      TriState fencedYard
    }
    EVENT_BANNER {
      Id eventId PK
      Text title
      Text dateText
      Instant startAt
      Instant endAt
    }
    USER {
      Id userId PK
      Text authProviderId
    }
    FAVORITE {
      Id userId PK_FK
      Id placeId PK_FK
      Instant createdAt
    }
    PLACE_RELATION {
      Id relationId PK
      Id leftPlaceId FK
      Id rightPlaceId FK
      RelationStatus relationStatus
    }
    REGION_CODE_REFERENCE {
      Text code PK
      Text name
    }
```

---

## 5. KTO 원천 필드와 서비스 필드 분리

| 구분 | 원천 필드 | 서비스 필드 | 규칙 |
|---|---|---|---|
| 식별 | `contentid` | `placeId` | contentId별 최초 Place를 만들 수 있으나 둘은 같은 개념이 아니다. |
| 유형 | `contenttypeid`, `contenttype_name` | `serviceCategory` | 12/14/15/28/32/38/39를 보존. 앱 cafe/trail을 임의 생성하지 않음. |
| 분류 | `lclsSystm1/2/3`, `cat1/2/3` | `serviceCategory`, `tags` | 서로 덮어쓰지 않음. `lcls*` raw 100%, `cat*` 914/2126. |
| 지역 | `lDongRegnCd`, `lDongSignguCd` | `municipality`, `regionArea` | 110/130은 시 단위 변환 가능. 동/서는 향후 주소 파싱+검증. |
| Pet 존재 | collector `has_pet` | `petInformationStatus` | Y→`KTO_OVERLAY_FOUND`, N→`UNKNOWN`. N→`petAcceptance=FALSE` 금지. |
| 동반 범위 | `acmpyTypeCd` | `spacePolicy`, `indoorAllowed`, `outdoorAllowed` | 원문 한글 라벨 보존. 실내/야외 자동 변환 금지. |
| Pet 상세 | `acmpyNeedMtr`, `acmpyPsblCpam`, `etcAcmpyInfo`, `rela*` | 구조화 정책/편의시설 | 원문 보존 후 사람 검증을 거친 경우에만 서비스 필드 채움. |
| 좌표 | `mapx`, `mapy` | `longitude`, `latitude`, `coordinateQualityStatus` | 값을 보존. 영주산 `mapx=12.797...`도 수정하지 않고 품질 상태만 표시. |
| 주소 | `addr1`, `addr2` | `address`, `roadAddress` | 서비스 `address` 초기값=`addr1`. `addr2`는 원천 보존. |

KTO Pet ∩ 제주 음식점은 1건이다. 이는 “제주 펫 식당은 1개”가 아니다. 음식점·카페·숙박 펫 정책 완성에는 별도 출처가 필요하다.

---

## 6. Provenance

허용 `source`: `KTO`, `VISIT_JEJU`, `TEAM_RESEARCH`, `OWNER_INPUT`, `USER_REPORT`, `OTHER_PUBLIC_DATA`.

```text
source
sourceDataset
sourceId
sourceUpdatedAt
importedAt
verifiedAt
verificationStatus
```

- `sourceUpdatedAt`: 출처가 제공한 수정 시각. 없으면 null.
- `importedAt`: 실제 적재 시각. 설계 단계에서는 null.
- `verifiedAt`: 사람이 사실성을 검증한 시각. 미검증이면 null.
- 서비스 필드는 `evidenceSourceIds`로 근거 Source Record를 가리킨다.
- 필드별 출처가 다를 때만 제한적 `fieldSources`. 모든 값을 assertion 테이블로 분해하지 않는다.
- UserReport는 현재값을 즉시 덮어쓰지 않고 `UNVERIFIED` 또는 `DISPUTED` 근거로 남긴다.

---

## 7. 복수 contentId와 장소 그룹화

V1 원칙: **한 KTO contentId = 독립 PlaceSourceRecord. 자동 병합하지 않는다.**

- title, 주소, 좌표는 unique key가 아니다.
- 동일 실제 시설처럼 보여도 contentType과 Pet 오버레이가 다를 수 있다.
- 관계는 `PlaceRelation`으로만 남기고, `CONFIRMED` 전에 한 카드로 묶지 않는다.
- 제주동화마을 3371999(관광지, Pet 미확인)와 4026831(쇼핑, KTO Pet 오버레이)은 독립 Place다.
- 추가 근거: 두 레코드 좌표는 `126.7320377305 / 33.4354329703` vs `126.732037746765 / 33.4354329886865`로 미세하게 다르고, `mlevel`은 6 / 공백이다.

---

## 8. Sample Mapping (원천 재확인)

명시하지 않은 서비스 필드는 `null` 또는 `UNKNOWN`. `places.ts` 하드코딩 값은 사용하지 않았다. 애니 검증에서 원천과 불일치했던 해성파크텔 `address`는 `addr1`만 쓴다.

### 8.1 카페에벤에셀 — contentId 3401751

KTO Pet ∩ 제주 음식점 1건. 제주에서 `relaRntlPrdlst`가 있는 유일한 행이다. 원문은 보존하고 AmenityProfile은 자동 확정하지 않는다.

```yaml
Place:
  placeId: "kto-3401751"
  name: "카페에벤에셀"
  serviceCategory: null
  municipality: "JEJU_CITY"
  address: "제주특별자치도 제주시 1100로 3198-20 (노형동)"
  latitude: 33.47294795011673
  longitude: 126.48581224833323
  primaryImageUrl: null
  phone: null
PlaceSourceRecord:
  source: "KTO"
  sourceDataset: "areaBasedList2+detailPetTour2"
  sourceId: "3401751"
  contentTypeId: "39"
  lclsSystm1: "FD"
  lclsSystm2: "FD05"
  lclsSystm3: "FD050100"
  acmpyTypeCd: "전구역 동반가능"
  acmpyNeedMtr: "매너벨트 착용"
  acmpyPsblCpam: "12kg 이하 동반 가능"
  etcAcmpyInfo: "3마리까지 가능"
  relaAcdntRiskMtr: "12kg 이하 동반 가능"
  relaFrnshPrdlst: "배변판, 식기, 매너벨트"
  relaPosesFclty: "안전문, 울타리"
  relaPurcPrdlst: "화식, 강아지 수제 간식, 매너벨트, 강아지 옷, 장난감 등"
  relaRntlPrdlst: "강아지 방석"
PetPolicy:
  petInformationStatus: "KTO_OVERLAY_FOUND"
  petAcceptance: "UNKNOWN"
  smallDogAllowed: "UNKNOWN"
  mediumDogAllowed: "UNKNOWN"
  largeDogAllowed: "UNKNOWN"
  indoorAllowed: "UNKNOWN"
  carrierRequired: "UNKNOWN"
  sizeDescription: null
AmenityProfile:
  fencedYard: "UNKNOWN"
  waterBowlProvided: "UNKNOWN"
  wasteBagsProvided: "UNKNOWN"
  photoZone: "UNKNOWN"
  dogMenu: "UNKNOWN"
```

`12kg 이하`와 `안전문, 울타리`를 소/중형 또는 `fencedYard=TRUE`로 자동 분해하지 않는다.

### 8.2 해성파크텔 — contentId 2626708

```yaml
Place:
  placeId: "kto-2626708"
  name: "해성파크텔"
  serviceCategory: null
  municipality: "SEOGWIPO_CITY"
  address: "제주특별자치도 서귀포시 천제연로 158-4"
  latitude: 33.2523116402
  longitude: 126.4213570284
  primaryImageUrl: null
PlaceSourceRecord:
  source: "KTO"
  sourceId: "2626708"
  contentTypeId: "32"
  cat1: "B02"
  cat2: "B0201"
  cat3: "B02011100"
  lclsSystm1: "AC"
  lclsSystm2: "AC06"
  lclsSystm3: "AC060200"
  addr1: "제주특별자치도 서귀포시 천제연로 158-4"
  addr2: "(중문동)"
  acmpyTypeCd: "일부구역 동반가능"
  acmpyPsblCpam: "소형견 1마리"
PetPolicy:
  petInformationStatus: "KTO_OVERLAY_FOUND"
  petAcceptance: "UNKNOWN"
  spacePolicy: null
  indoorAllowed: "UNKNOWN"
  outdoorAllowed: "UNKNOWN"
```

`일부구역`은 어느 공간인지 말하지 않으므로 실내·야외를 채우지 않는다.

### 8.3 제주동화마을 — 두 contentId를 별도 유지

```yaml
- Place:
    placeId: "kto-3371999"
    name: "제주동화마을"
    address: "제주특별자치도 제주시 구좌읍 비자림로 1191"
    latitude: 33.4354329703
    longitude: 126.7320377305
  PlaceSourceRecord:
    sourceId: "3371999"
    contentTypeId: "12"
    lclsSystm1: "NA"
    lclsSystm2: "NA04"
    lclsSystm3: "NA040700"
    mlevel: 6
  PetPolicy:
    petInformationStatus: "UNKNOWN"
    petAcceptance: "UNKNOWN"
- Place:
    placeId: "kto-4026831"
    name: "제주동화마을"
    address: "제주특별자치도 제주시 구좌읍 비자림로 1191"
    latitude: 33.4354329886865
    longitude: 126.732037746765
  PlaceSourceRecord:
    sourceId: "4026831"
    contentTypeId: "38"
    lclsSystm1: "SH"
    lclsSystm2: "SH04"
    lclsSystm3: "SH040300"
    mlevel: null
    acmpyTypeCd: "전구역 동반가능"
  PetPolicy:
    petInformationStatus: "KTO_OVERLAY_FOUND"
    petAcceptance: "UNKNOWN"
PlaceRelation:
  relationStatus: null
  placeGroupId: null
```

### 8.4 영주산 — contentId 2704351

```yaml
Place:
  placeId: "kto-2704351"
  name: "영주산"
  municipality: "SEOGWIPO_CITY"
  address: "제주특별자치도 서귀포시 표선면 성읍리"
  latitude: 33.4042093891
  longitude: 12.79737228191
  coordinateQualityStatus: "SOURCE_ANOMALY"
PlaceSourceRecord:
  sourceId: "2704351"
  contentTypeId: "12"
  lclsSystm1: "NA"
  lclsSystm2: "NA01"
  lclsSystm3: "NA010100"
  cat1: "A01"
  cat2: "A0101"
  cat3: "A01010400"
  mapx: 12.79737228191
  mapy: 33.4042093891
PetPolicy:
  petInformationStatus: "UNKNOWN"
  petAcceptance: "UNKNOWN"
```

원천 `mapx`를 보정하지 않는다. 지도 UI는 품질 상태로 제외할 수 있다.

### 8.5 CU 제주항국제여객터미널 — contentId 3307106

쇼핑 Pet 276건의 성격. `SH040300`을 펫 카페로 분류하지 않는다.

```yaml
Place:
  placeId: "kto-3307106"
  name: "CU 제주항국제여객터미널"
  municipality: "JEJU_CITY"
  address: "제주특별자치도 제주시 임항로 191 (건입동)"
  latitude: 33.5258373782
  longitude: 126.5440785094
PlaceSourceRecord:
  sourceId: "3307106"
  contentTypeId: "38"
  lclsSystm1: "SH"
  lclsSystm2: "SH04"
  lclsSystm3: "SH040300"
  acmpyTypeCd: "전구역 동반가능"
  acmpyNeedMtr: null
  acmpyPsblCpam: null
PetPolicy:
  petInformationStatus: "KTO_OVERLAY_FOUND"
  petAcceptance: "UNKNOWN"
  indoorAllowed: "UNKNOWN"
  carrierRequired: "UNKNOWN"
```

---

## 9. Firestore Mapping 가능성 — 기술 미확정

Firestore를 선택한다면 단순 매핑 후보는 다음과 같다.

- `places/{placeId}`: Place 핵심 + 작고 고정된 `petPolicy`, `amenities` map.
- `places/{placeId}/sources/{placeSourceId}`: 출처별 원천 관측값과 provenance.
- `events/{eventId}`, `users/{userId}`.
- `users/{userId}/favorites/{placeId}` 또는 top-level `favorites`.
- `placeRelations/{relationId}`, `regionCodes/{code}`.

논리 Entity가 곧 별도 document일 필요는 없다. 목록 필터가 잦은 tri-state는 `places` 문서 scalar/map으로 둘 수 있다. Source Record는 크기와 변경 주기가 달라 subcollection이 자연스럽다.

### 쿼리 제약 (기술 선택 전에 확인할 것)

현재 App `FilterState`는 `region`, `category`, `dogSize`, `indoorAllowedOnly`, `freeParkingOnly`, `offLeashYardOnly`, `dogMenuOnly`와 `searchQuery`를 동시에 쓴다.

- Firestore는 다중 등호/범위 조합마다 복합 인덱스가 늘어난다.
- Firestore는 장소명/주소 **부분 문자열 검색을 지원하지 않는다.** `searchQuery`는 클라이언트 필터, 별도 검색 서비스, 또는 토큰 필드가 필요하다.
- 이 제약은 Firestore를 기각하는 근거가 아니라, 기술 선택 회의에서 확인할 항목이다.
- 최종 기술은 아직 정하지 않는다.

---

## 10. Field Group 수

`FIELD_MAPPING_MATRIX.csv` 재집계 (애니 D-3 반영, `ingestAlias.*` 9행은 `ALIAS`로 분리).

| 그룹 | 의미 | 수 |
|---|---|---|
| A | 현재 실제 데이터로 채울 수 있음 | **26** |
| B | 현재 일부만 채울 수 있음 | **24** |
| C | 앱/향후 서비스에 필요하나 현재 데이터 없음 | **52** |
| D | 내부 관리·출처·검증 | **27** |
| ALIAS | JOIN CSV 컬럼 별칭. 저장 필드 아님 | 9 (집계 제외) |
| 스키마 필드 합계 | A+B+C+D | **129** |

C가 행크 초안 50에서 52로 늘어난 이유: `place.regionName`, `event.dateText` 추가.

그룹은 “필드가 존재하는가”가 아니라 현재 2,126행 기준의 채움 가능성이다. `has_pet`은 전 행이 있어 A지만, 서비스 `petAcceptance`는 1,796건을 불가로 판단할 수 없어 C다.

---

## 11. 남은 쟁점 (Owner / Toby)

1. `serviceCategory` 사전에 쇼핑·문화시설·레포츠·행사를 넣을지, 기존 앱 5종과 KTO 유형 필터를 병행할지.
2. 동부/서부 경계 읍면 목록과 우도·추자도·도심 동의 처리 규칙.
3. KTO `전구역/일부구역 동반가능`을 “KTO 제공 동반 정보”로 바로 노출할지, 팀 검증 뒤에만 서비스 정책으로 노출할지.
4. 중복 후보를 한 카드로 묶을 때 contentType별 하위 항목을 유지하는 UX가 필요한지.
5. OwnerInput·TeamResearch가 구조화 정책을 확정할 때 필요한 최소 증빙.
6. `spacePolicy` 정본 어휘. 앱 `types.ts`에 Filter용(`all|indoor|indoor_carrier|outdoor_only`)과 Place용(`indoor_free|indoor_carrier|outdoor_terrace_only|outdoor_and_indoor`)이 공존한다.
7. 실제 저장소 기술(Firestore 포함) 선택. 선택 전에 §9 쿼리 제약을 확인한다.

---

## 12. 이번 단계에서 하지 않은 것

Firebase/Firestore 생성, DB Import, `src/` 수정, Login/찜 구현, Raw Dataset 수정, `places.ts` 사실 Import, 배포, `main` merge, Commit/Push.

다음 단계(기술 선택·구축 검토)는 Owner와 Toby 승인 후에만 시작한다.
