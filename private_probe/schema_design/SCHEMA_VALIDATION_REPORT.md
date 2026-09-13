# SCHEMA_VALIDATION_REPORT — Ani 독립 검증

검증자: 애니(Ani). 역할 = 독립 Review + 검증. 이 스키마의 설계자가 아니다(설계자 = 행크).
검증 대상: `private_probe/schema_design/HANK_SCHEMA_DRAFT.md`, `private_probe/schema_design/FIELD_MAPPING_MATRIX.csv`
검증 기준 파일(원천): `private_probe/20260911T143232Z/` Run 전용. 이 Run의 어떤 파일도 수정하지 않았다.

이 문서는 행크의 요약을 신뢰하지 않고 원천 파일을 직접 읽어 재확인한 결과다.

---

## 1. 검증 방법

| 항목 | 방법 |
|---|---|
| Sample 5건(contentId 6개) 값 대조 | `tables/jeju_pet_join.csv`를 `Import-Csv -Encoding UTF8`로 로드해 `contentid` 6건을 추출하고 필드별로 행크 YAML과 1:1 대조 |
| `lclsSystm1/2/3`, `mlevel` | CSV에 없는 필드이므로 `raw/areaBasedList2_ldong50_p001~p022.json`을 전수 파싱해 해당 `contentid`의 raw item에서 직접 읽음 |
| 전제 건수(2126 / 330 / 1796) | JOIN CSV 행수, `has_pet` 그룹 집계, `contentid` unique 수를 직접 계산 |
| Pet 상세 Coverage | `tables/jeju_pet_330_field_coverage.csv` 및 `dataset_inventory/field_catalog.csv`와 대조 |
| Matrix 행수 / 그룹 수 | `FIELD_MAPPING_MATRIX.csv`를 `Import-Csv`로 로드해 `group` 별 집계 |
| KTO 필드 누락 여부 | `field_catalog.csv`의 50개 field_name 전부를 camelCase 매핑 후 Matrix 본문에서 존재 확인 |
| App 필드 누락 여부 | `src/types.ts` 인터페이스 필드 전수 + `src/data/banners.ts` 실제 값 형태 확인 (`src/` 은 읽기만 했고 수정하지 않음) |

직접 재계산한 전제 값:

- JOIN CSV 행수 = **2,126**
- `contentid` unique = **2,126** (중복 없음)
- `has_pet=Y` = **330**, `has_pet=N` = **1,796**
- `pet_acmpyTypeCd` non-empty = **330** (= Pet 매칭 330건에만 라벨 존재)

→ 행크가 전제로 삼은 2,126 / 330 / 1,796은 원천과 일치한다.

---

## 2. Sample 5건 필드별 대조

판정 표기: **MATCH** = 원천과 일치 / **DERIVED-OK** = 원천값이 아닌 파생값이나 초안이 파생임을 명시 / **MISMATCH** = 원천과 불일치 / **OMITTED** = 원천에 값이 있는데 sample에 나타나지 않음(허위 주장은 아님)

### 2.1 카페에벤에셀 — contentId 3401751

원천: `jeju_pet_join.csv` 해당 행, raw `areaBasedList2_ldong50_p007.json`

| 행크 sample 값 | 원천 필드 | 원천 실제 값 | 판정 |
|---|---|---|---|
| `name: 카페에벤에셀` | title | 카페에벤에셀 | MATCH |
| `municipality: JEJU_CITY` | lDongSignguCd | 110 | DERIVED-OK |
| `address: 제주특별자치도 제주시 1100로 3198-20 (노형동)` | addr1 | 동일 (addr2 공백) | MATCH |
| `latitude: 33.47294795011673` | mapy | 33.47294795011673 | MATCH |
| `longitude: 126.48581224833323` | mapx | 126.48581224833323 | MATCH |
| `primaryImageUrl: null` | firstimage | 공백 | MATCH |
| `phone: null` | tel | 공백 | MATCH |
| `contentTypeId: "39"` | contenttypeid | 39 | MATCH |
| `lclsSystm1: FD` | raw lclsSystm1 | FD | MATCH |
| `lclsSystm2: FD05` | raw lclsSystm2 | FD05 | MATCH |
| `lclsSystm3: FD050100` | raw lclsSystm3 | FD050100 | MATCH |
| `acmpyTypeCd: 전구역 동반가능` | pet_acmpyTypeCd | 전구역 동반가능 | MATCH |
| `acmpyNeedMtr: 매너벨트 착용` | pet_acmpyNeedMtr | 매너벨트 착용 | MATCH |
| `acmpyPsblCpam: 12kg 이하 동반 가능` | pet_acmpyPsblCpam | 12kg 이하 동반 가능 | MATCH |
| `etcAcmpyInfo: 3마리까지 가능` | pet_etcAcmpyInfo | 3마리까지 가능 | MATCH |
| `petInformationStatus: KTO_OVERLAY_FOUND` | has_pet | Y | MATCH |
| (없음) | pet_relaAcdntRiskMtr | **12kg 이하 동반 가능** | OMITTED |
| (없음) | pet_relaFrnshPrdlst | **배변판, 식기, 매너벨트** | OMITTED |
| (없음) | pet_relaPosesFclty | **안전문, 울타리** | OMITTED |
| (없음) | pet_relaPurcPrdlst | **화식, 강아지 수제 간식, 매너벨트, 강아지 옷, 장난감 등** | OMITTED |
| (없음) | pet_relaRntlPrdlst | **강아지 방석** | OMITTED |
| `sizeDescription: null` 등 서비스 필드 | — | 원천에 서비스 필드 없음 | MATCH(정책상 UNKNOWN/null) |

행크가 주장한 값에 허위는 없다. 다만 이 레코드는 제주 330건 중 `relaFrnshPrdlst`(2건 중 1건), `relaPosesFclty`(2건 중 1건), `relaPurcPrdlst`(2건 중 1건), `relaRntlPrdlst`(**전 제주 유일 1건**)를 동시에 보유한 유일한 행이다. 즉 `AmenityProfile`(안전문/울타리 → `fencedYard`, 사진공간 → `photoZone`, 식기 → `waterBowlProvided`, 배변판 → `wasteBagsProvided`) 매핑을 실제 값으로 검증할 수 있는 **단 하나의 기회**였는데 sample에서 빠졌다. 초안 §8 전제는 "명시하지 않은 **서비스 필드**는 null/UNKNOWN"이므로 원천 필드 누락은 규칙으로 면제되지 않는다. → 결함 D-3.

### 2.2 해성파크텔 — contentId 2626708

원천: JOIN CSV 해당 행, raw `areaBasedList2_ldong50_p022.json`

| 행크 sample 값 | 원천 필드 | 원천 실제 값 | 판정 |
|---|---|---|---|
| `name: 해성파크텔` | title | 해성파크텔 | MATCH |
| `municipality: SEOGWIPO_CITY` | lDongSignguCd | 130 | DERIVED-OK |
| `address: 제주특별자치도 서귀포시 천제연로 158-4 (중문동)` | addr1 / addr2 | addr1 = `제주특별자치도 서귀포시 천제연로 158-4`, addr2 = `(중문동)` | **MISMATCH(경미)** — addr1+addr2 결합값이며 Matrix의 `place.address ← KTO addr1 / 초기값은 addr1` 규칙과 다르다. 결합 규칙이 초안에 없다. |
| `latitude: 33.2523116402` | mapy | 33.2523116402 | MATCH |
| `longitude: 126.4213570284` | mapx | 126.4213570284 | MATCH |
| `primaryImageUrl: null` | firstimage | 공백 | MATCH |
| `contentTypeId: "32"` | contenttypeid | 32 | MATCH |
| `cat1: B02 / cat2: B0201 / cat3: B02011100` | cat1/2/3 | B02 / B0201 / B02011100 | MATCH |
| `acmpyTypeCd: 일부구역 동반가능` | pet_acmpyTypeCd | 일부구역 동반가능 | MATCH |
| `acmpyPsblCpam: 소형견 1마리` | pet_acmpyPsblCpam | 소형견 1마리 | MATCH |
| `petInformationStatus: KTO_OVERLAY_FOUND` | has_pet | Y | MATCH |
| `spacePolicy / indoorAllowed / outdoorAllowed` 미채움 | — | 원천은 구역만 말함 | MATCH(정책 준수) |
| (없음) | raw lclsSystm1/2/3 | **AC / AC06 / AC060200** | OMITTED |

`일부구역 동반가능`을 실내/야외로 변환하지 않은 점은 원천에 근거가 없으므로 옳다. 다만 8.1은 `lclsSystm*`을 싣고 8.2는 `cat*`만 실어 sample 표현이 일관되지 않다.

### 2.3 제주동화마을 — contentId 3371999 / 4026831

원천: JOIN CSV 두 행, raw `p002.json`(3371999) / `p008.json`(4026831)

| 행크 sample 값 | 원천 실제 값 | 판정 |
|---|---|---|
| 3371999 `contentTypeId: "12"` | 12 (관광지) | MATCH |
| 3371999 `lclsSystm1/2/3: NA / NA04 / NA040700` | NA / NA04 / NA040700 | MATCH |
| 3371999 `address: 제주특별자치도 제주시 구좌읍 비자림로 1191` | addr1 동일 | MATCH |
| 3371999 `petInformationStatus: UNKNOWN` | has_pet = N | MATCH (N을 FALSE로 바꾸지 않음) |
| 4026831 `contentTypeId: "38"` | 38 (쇼핑) | MATCH |
| 4026831 `lclsSystm1/2/3: SH / SH04 / SH040300` | SH / SH04 / SH040300 | MATCH |
| 4026831 `address: 제주특별자치도 제주시 구좌읍 비자림로 1191` | addr1 동일 | MATCH |
| 4026831 `acmpyTypeCd: 전구역 동반가능` | 전구역 동반가능 | MATCH |
| 4026831 `petInformationStatus: KTO_OVERLAY_FOUND` | has_pet = Y | MATCH |
| 두 건을 독립 Place로 유지, `placeGroupId: null` | — | 설계 판단, 원천과 모순 없음 |

추가로 확인한 사실(초안에 없음): 두 레코드의 좌표는 **완전히 같지 않다**. 3371999 = `126.7320377305 / 33.4354329703`, 4026831 = `126.732037746765 / 33.4354329886865`. 또 `mlevel`은 3371999 = 6, 4026831 = 공백이다. 좌표를 unique key로 쓸 수 없다는 초안 §7 원칙을 뒷받침하는 근거이므로 기재하는 편이 좋다(권고 R-5).

### 2.4 영주산 — contentId 2704351

원천: JOIN CSV 해당 행, raw `p017.json`

| 행크 sample 값 | 원천 실제 값 | 판정 |
|---|---|---|
| `longitude: 12.79737228191` / `mapx: 12.79737228191` | mapx = 12.79737228191 (CSV·raw 동일) | MATCH — **보정하지 않음 확인** |
| `latitude: 33.4042093891` / `mapy: 33.4042093891` | 33.4042093891 | MATCH |
| `address: 제주특별자치도 서귀포시 표선면 성읍리` | addr1 동일 | MATCH |
| `municipality: SEOGWIPO_CITY` | lDongSignguCd 130 | DERIVED-OK |
| `contentTypeId: "12"` | 12 | MATCH |
| `lclsSystm1/2/3: NA / NA01 / NA010100` | NA / NA01 / NA010100 | MATCH |
| `petInformationStatus: UNKNOWN` | has_pet = N | MATCH |
| `coordinateQualityStatus: SOURCE_ANOMALY` | 원천에 없는 파생 상태값 | DERIVED-OK (초안 §5·§8.4에서 파생임을 명시) |
| (없음) | cat1/2/3 = **A01 / A0101 / A01010400**, areacode = 39, sigungucode = 3 | OMITTED |

경도 오류를 서비스 필드에서도 그대로 두고 품질 상태만 붙인 처리는 Owner 원칙(임의 보정 금지)에 맞다.

### 2.5 CU 제주항국제여객터미널 — contentId 3307106

원천: JOIN CSV 해당 행, raw `p003.json`

| 행크 sample 값 | 원천 실제 값 | 판정 |
|---|---|---|
| `name: CU 제주항국제여객터미널` | title 동일 | MATCH |
| `municipality: JEJU_CITY` | lDongSignguCd 110 | DERIVED-OK |
| `address: 제주특별자치도 제주시 임항로 191 (건입동)` | addr1 동일 (addr2 공백) | MATCH |
| `latitude: 33.5258373782` | mapy | MATCH |
| `longitude: 126.5440785094` | mapx | MATCH |
| `contentTypeId: "38"` | 38 | MATCH |
| `lclsSystm3: SH040300` | SH040300 (raw lclsSystm1=SH, lclsSystm2=SH04) | MATCH |
| `acmpyTypeCd: 전구역 동반가능` | 전구역 동반가능 | MATCH |
| `acmpyNeedMtr: null` | pet_acmpyNeedMtr 공백 | MATCH |
| `acmpyPsblCpam: null` | pet_acmpyPsblCpam 공백 | MATCH |
| `petInformationStatus: KTO_OVERLAY_FOUND` / `petAcceptance: UNKNOWN` | has_pet = Y | MATCH |
| "`SH040300`이나 KTO Pet 매칭을 펫 카페로 분류하지 않는다" | 쇼핑 Pet 276건 중 275건이 SH040300 (`DATA_USABILITY_REVIEW.md` §3) | MATCH |

### 2.6 Sample 대조 종합

| contentId | 행크 주장 필드 수(대조 대상) | MATCH | MISMATCH | OMITTED |
|---|---|---|---|---|
| 3401751 | 16 | 16 | 0 | 5 |
| 2626708 | 14 | 13 | 1 (address 결합) | 3 |
| 3371999 | 4 | 4 | 0 | 0 |
| 4026831 | 5 | 5 | 0 | 0 |
| 2704351 | 9 | 9 | 0 | 5 |
| 3307106 | 11 | 11 | 0 | 2 |

**결론: 행크가 sample에 적은 값 중 원천과 다른 것은 해성파크텔 `address` 1건뿐이다(addr1+addr2 결합, 규칙 미기재).** 나머지는 CSV·raw JSON과 일치하며, 특히 `lclsSystm*` 6건 전부, 영주산 경도 오류값, has_pet → petInformationStatus 변환 4건이 정확하다. 값을 발명한 흔적은 없다.

---

## 3. Matrix 검증

### 3.1 행수·그룹 수

`Import-Csv`로 직접 집계한 결과:

| 그룹 | 행크 §10 주장 | 애니 재계산 | 일치 |
|---|---|---|---|
| A (현재 채울 수 있음) | 26 | **26** | 예 |
| B (일부만 채울 수 있음) | 33 | **33** | 예 |
| C (필요하나 데이터 없음) | 50 | **50** | 예 |
| D (내부·출처·검증) | 27 | **27** | 예 |
| 합계 | 136 | **136** | 예 |

숫자 자체는 정확하다. 다만 그룹 구성에 다음 문제가 있다(§4 결함 D-2, D-5).

- B 33행 중 **9행이 `ingestAlias.pet_*`**이다. 이는 JOIN CSV의 컬럼 접두사 별칭이며, 같은 KTO 원천 필드가 이미 `placeSource.kto.pet.*`로 9행 존재한다. 행크 본인 비고도 "원본 …로 매핑하며 중복 저장하지 않음"이라고 적어 스키마 필드가 아님을 인정한다. 즉 실질 B는 24행이고, B가 약 27% 과대 집계돼 있다.
- `place.coordinateQualityStatus`가 A(2126/2126)에 있다. 원천 관측값이 아니라 적재 시 계산하는 내부 품질 상태이므로 D 성격에 가깝다. 전 행 산출이 가능하다는 점에서 A도 방어는 되지만, "현재 실제 데이터로 채울 수 있음"의 뜻이 흐려진다.
- `referenceRegion.rnum`이 A에 있다. 행크 비고도 "업무 식별자로 사용하지 않음"이라 적었다.

이 숫자는 지니가 Owner 보고서 §12의 4·5·6항(바로 채울 수 있는/일부만/향후 수집 필드 수)에 그대로 쓸 값이므로, 보고 전 재집계가 필요하다.

### 3.2 필수 열 (task §8)

| task §8 요구 열 | Matrix 열 | 존재 |
|---|---|---|
| Field name | `field_name` | 예 |
| 한글 의미 | `korean_meaning` | 예 |
| Entity/Collection | `entity` | 예 |
| Data type | `data_type` | 예 |
| 현재 Source | `current_source` | 예 |
| 현재 Coverage | `current_coverage` | 예 |
| Null/Unknown 허용 여부 | `null_unknown_allowed` | 예 |
| 검색/Filter 사용 여부 | `search_filter` | 예 |
| UI 표시 후보 여부 | `ui_candidate` | 예 |
| 향후 수집 필요 여부 | `future_collect` | 예 |
| 비고 | `notes` | 예 |
| (추가) 그룹 | `group` | 예 |

11개 필수 열 전부 존재한다. 열 요건은 충족.

### 3.3 Entity 라벨 vs 초안 §3 정의

Matrix의 `entity` 값 11종 중 초안 §3이 정의한 Entity는 7종뿐이다.

| Matrix entity | 행수 | 초안 §3 정의 |
|---|---|---|
| Place | 26 | 있음 |
| PlaceSourceRecord | 45 | 있음 |
| PetPolicy | 19 | 있음 |
| AmenityProfile | 7 | 있음 |
| EventBanner | 14 | 있음 |
| User | 4 | 있음 |
| Favorite | 3 | 있음 |
| **RegionCodeReference** | 3 | **없음** |
| **ImportMapping** | 9 | **없음** |
| **PlaceRelation** | 4 | **없음** (§7에 개념만 서술) |
| `Place PetPolicy AmenityProfile` | 2 | 단일 Entity가 아닌 복합 라벨 |

미정의 Entity 16행 = 전체의 11.8%. 지니가 통합 시 정의 없는 Entity를 만나게 된다(결함 D-2).

### 3.4 Coverage 수치 정확성

Matrix의 KTO Coverage 값을 `field_catalog.csv`와 대조했다. `addr2 422`, `areaCode 913`, `cat1/2/3 914`, `cpyrhtDivCd 1910`, `firstImage/firstImage2 1910`, `mapLevel 1880`, `sigunguCode 910`, `tel 26`, `zipcode 2115`, `acmpyTypeCd 330`, `acmpyNeedMtr 51`, `acmpyPsblCpam 53`, `etcAcmpyInfo 50`, `relaAcdntRiskMtr 34`, `relaFrnshPrdlst 2`, `relaPosesFclty 2`, `relaPurcPrdlst 2`, `relaRntlPrdlst 1` — **전부 일치**. Pet 필드에 "330 기준 n/330"을 함께 적어 분모 혼동을 막은 점은 좋다.

---

## 4. 누락 필드 점검

### 4.1 KTO 필드 (field_catalog.csv 50개)

50개 `field_name`을 camelCase 매핑 후 Matrix 전문에서 확인했다. **누락 0건.** 지시된 확인 대상도 모두 존재한다.

| 확인 요구 필드 | Matrix 위치 | 비고 |
|---|---|---|
| `lclsSystm1/2/3` | `placeSource.kto.lclsSystm1/2/3`, 그룹 A | CSV에 없고 raw 100%임을 비고에 명시 |
| `mlevel` | `placeSource.kto.mapLevel`, 그룹 B | 1880/2126 (88.4%) |
| `zipcode` | `placeSource.kto.zipcode`, 그룹 B | 2115/2126, 문자열 보존 |
| `tel` | `placeSource.kto.tel`(B) + `place.phone`(B) | 26/2126 |
| 이미지 | `firstImage`, `firstImage2`, `place.primaryImageUrl`, `place.secondaryImageUrl`, `copyrightDivisionCode` | 저작권 구분 별도 필드 유지 |
| pet `rela*` 4종 | `placeSource.kto.pet.relaFrnshPrdlst / relaPosesFclty / relaPurcPrdlst / relaRntlPrdlst` | 원문 보존, 자동 구조화 금지 명시 |
| `relaAcdntRiskMtr` | `placeSource.kto.pet.relaAcdntRiskMtr` | "체중 제한도 섞임" 비고 있음 |
| `ldongCode2` 참조 | `referenceRegion.code/name/rnum` | Entity 정의만 없음(D-2) |

### 4.2 App 필드 (`src/types.ts` §5 요구 항목)

task §5의 항목을 하나씩 확인했다. **Pet Policy 12항목, Amenities 7항목, 장소 기본·운영 15항목, users/favorites 자리 모두 존재한다.** 누락은 다음 2건이다.

| 누락/축소 | 근거 | 영향 |
|---|---|---|
| `EventBanner.date` 자유 텍스트 | `src/types.ts`의 `EventBanner.date?: string`. 실제 값은 `src/data/banners.ts`에 `'2026.09.20 ~ 09.22'`, `'2026.09.15 ~ 10.15'`, `'2026.10.03'`, 그리고 **`'상시 운영'`**. 행크는 `startAt`/`endAt` `Instant`만 두었다. `'상시 운영'`은 Instant 두 개로 표현할 수 없다. | 기존 배너 4건 중 1건이 손실된다. `event.dateText` 1필드 추가로 해결 (권고 R-3) |
| `Place.regionName` | `src/types.ts` `Place.regionName: string` | `regionArea` 사전에서 파생 가능하므로 실질 손실은 아니나, 초안에 파생 규칙이 없다 |

추가로, App 자체에 `SpacePolicy` 어휘가 두 가지로 공존한다. `src/types.ts`의 `export type SpacePolicy = 'all' | 'indoor' | 'indoor_carrier' | 'outdoor_only'`와 `PetPolicy.spacePolicy: 'indoor_free' | 'indoor_carrier' | 'outdoor_terrace_only' | 'outdoor_and_indoor'`가 다르다. 행크의 `petPolicy.spacePolicy`는 Enum으로 두고 값 사전을 정의하지 않아 이 충돌이 그대로 남는다(권고 R-4). 이는 App 쪽 기존 문제이므로 스키마 결함으로 보지 않고 지니가 결정할 조건으로 남긴다.

---

## 5. 의미 왜곡 점검 (2126 + 330 적재 시)

원천을 다시 계산해 초안 문장과 대조했다.

| 점검 | 결과 |
|---|---|
| 1,796건이 `false`로 저장되는가 | 아니다. `petPolicy.petInformationStatus`에서 N → `UNKNOWN`, `petAcceptance`는 그룹 C(0/2126)로 아무 값도 넣지 않는다. Matrix 비고에 "KTO JOIN N을 FALSE로 변환 금지" 명시 |
| `acmpyTypeCd`가 실내/야외/캐리어로 자동 변환되는가 | 아니다. 초안 §1 비목표, §5 표, §8.1, §8.2, Matrix `indoorAllowed`/`outdoorAllowed` 비고 "acmpyTypeCd에서 추론 금지"에서 4중으로 차단 |
| 영주산 좌표가 보정되는가 | 아니다. 서비스 `longitude`와 원천 `mapx` 모두 12.79737228191 유지, `coordinateQualityStatus: SOURCE_ANOMALY`만 부여 |
| `SH040300`이 펫 카페로 분류되는가 | 아니다. §8.5에서 명시적으로 금지하고 쇼핑 Pet 276건의 성격을 설명 |
| "제주 펫 식당은 1개" 서술이 있는가 | 없다. §5 말미에 "KTO Pet ∩ 제주 음식점은 1건이며, 이는 '제주 펫 식당은 1개'라는 뜻이 아니다"라고 정확히 구분했고 §8.1에서도 Dataset 사실로만 표현 |
| 복수 contentId 자동 병합이 있는가 | 없다. §7에서 병합 금지, `placeGroupId`/`parentPlaceId`/`relatedPlaceIds` 모두 nullable, `RelationStatus`로 사람 확인 후에만 묶음 |
| 정책 boolean이 2-state인가 | 아니다. `petPolicy` 7개, `amenities` 6개 boolean 성격 필드 전부 `TriState` |
| 빈 배열이 불가로 읽히는가 | 초안 §2와 Matrix `allowedSizes` 비고에서 "빈 배열을 불가 의미로 사용하지 않음" 명시 |

의미 왜곡은 발견하지 못했다.

---

## 6. 남은 정합성 문제 요약 (상세는 SCHEMA_REVIEW_ANI.md)

1. Matrix가 초안 §3에 없는 Entity 3종(`RegionCodeReference`, `ImportMapping`, `PlaceRelation`)을 사용한다.
2. B 33행 중 9행이 스키마 필드가 아닌 CSV 컬럼 별칭이다.
3. 카페에벤에셀 sample이 값이 존재하는 pet `rela*` 5필드를 빼서 `AmenityProfile` 검증 기회를 놓쳤다.
4. 해성파크텔 `address`가 addr1+addr2 결합값인데 결합 규칙이 없다.
5. `place.secondaryImageUrl`이 Matrix에는 있으나 초안 §3.1 Place 필드 목록에는 없다.
6. `petPolicy.petInformationStatus` Coverage가 2126/2126인데 초안 §3.1 관계는 `Place 0..1 PetPolicy`다. PetPolicy 레코드가 없는 장소의 상태 해석 규칙이 없다.
7. Firestore 검토(§9)가 App `FilterState`의 6개 필터 + `searchQuery` 텍스트 검색을 다루지 않는다.
8. `EventBanner`에 자유 텍스트 기간 필드가 없어 `'상시 운영'` 배너가 손실된다.
