# SCHEMA_REVIEW_ANI — 행크 DB Schema V1 초안 독립 Review

리뷰어: 애니(Ani). `DB_SCHEMA_DESIGN_TASK.md` §2 기준 **독립 Review + 테스트/검증** 담당.
나는 이 스키마의 설계자가 아니다. 설계자는 행크이며, 나는 행크의 요약을 신뢰하지 않고 원천 파일을 직접 읽어 재확인했다.

리뷰 대상
- `private_probe/schema_design/HANK_SCHEMA_DRAFT.md`
- `private_probe/schema_design/FIELD_MAPPING_MATRIX.csv`

행크 파일은 수정하지 않았다. 실제 DB·Firestore 생성, `src/` 수정, commit/push/merge/deploy, `agent-collab-kit/STATE.md` 갱신, 원천 Dataset 변경은 하지 않았다.

---

## 1. 판정

# CONDITIONAL PASS

차단(blocker) 결함은 없다. 스키마는 Owner 원칙(unknown ≠ false, 임의 보정 금지, 원본·서비스 필드 분리, 자동 병합 금지)을 실제로 지키고 있고, sample 값은 원천과 일치한다. 다만 **Matrix와 초안 본문의 정합성 문제**와 **그룹 집계 과대**가 남아 있어, 지니가 아래 §5 조건을 기록·반영한 뒤 V1 초안으로 쓰는 것이 맞다. 조건은 모두 문서 수정 수준이며 재설계는 필요하지 않다.

---

## 2. 내가 독립적으로 확인한 것

원천 파일을 직접 읽어 재계산·재대조했다. 방법과 전체 결과는 `SCHEMA_VALIDATION_REPORT.md`에 있다.

1. `tables/jeju_pet_join.csv` 직접 로드 → 행수 2,126 / `contentid` unique 2,126 / `has_pet` Y 330·N 1,796 / `pet_acmpyTypeCd` non-empty 330 재계산. 행크 전제와 일치.
2. 행크 sample 6개 `contentId`(3401751, 2626708, 3371999, 4026831, 2704351, 3307106)를 CSV에서 추출해 필드별 1:1 대조.
3. CSV에 없는 `lclsSystm1/2/3`·`mlevel`은 `raw/areaBasedList2_ldong50_p001~p022.json` 22개 파일을 전수 파싱해 해당 레코드에서 직접 읽음. 행크가 적은 `lclsSystm` 6건 전부 원천 일치 확인.
4. `FIELD_MAPPING_MATRIX.csv`를 로드해 행수 136, 그룹 A26/B33/C50/D27 재집계. task §8 필수 11개 열 존재 확인. `entity` 라벨 분포 집계.
5. `dataset_inventory/field_catalog.csv`의 50개 KTO field_name 전부를 Matrix에서 존재 확인 + Coverage 수치 18개 대조.
6. `src/types.ts` 전체 인터페이스 필드와 task §5 목록을 Matrix와 대조. `src/data/banners.ts`의 실제 배너 값 형태 확인(읽기만 함).
7. `DATA_USABILITY_REVIEW.md`의 판정·건수와 초안 서술 대조(음식점 1건 해석, 쇼핑 Pet 276/275건 SH040300, 영주산 좌표, 중복 title 6그룹).

---

## 3. 필수 검증 Checklist (task §9)

| # | 항목 | 판정 | 근거 (파일 + 사실) |
|---|---|---|---|
| 1 | KTO 관측 Field가 불필요하게 손실되지 않는가 | **PASS** | `field_catalog.csv` 50개 field_name 전수 대조 결과 Matrix 누락 0건. CSV에 없는 `lclsSystm1/2/3`을 그룹 A(2126/2126, raw 100%)로, `mlevel`을 `placeSource.kto.mapLevel`(1880/2126)로 살렸다. `rela*` 4종·`relaAcdntRiskMtr`·`zipcode`·`cpyrhtDivCd`·`firstimage2`·`areacode`·`sigungucode`·`ldongCode2` 참조까지 전부 존재 |
| 2 | 기존 App 중요 Field가 빠지지 않았는가 | **PARTIAL** | task §5의 장소 기본·운영 15항목, Pet Policy 12항목, Amenities 7항목, users/favorites 자리 모두 존재. 다만 `src/types.ts` `EventBanner.date?: string`에 대응하는 자유 텍스트 필드가 없어 `src/data/banners.ts`의 `'상시 운영'`을 `startAt`/`endAt` `Instant`로 담을 수 없다. `Place.regionName`도 필드가 없다(파생 가능하나 규칙 미기재) |
| 3 | `unknown`과 `false`가 혼동되지 않는가 | **PASS** | 초안 §2 `TriState` 정의 "`FALSE`는 확인된 불가/미제공만", `PetInformationStatus`로 has_pet Y/N을 `KTO_OVERLAY_FOUND`/`UNKNOWN`에 매핑. Matrix `petPolicy.petAcceptance` 그룹 C·0/2126·비고 "KTO JOIN N을 FALSE로 변환 금지". `petPolicy` 7개, `amenities` 6개 boolean 성격 필드 전부 TriState. 금액 `0`=무료 / `null`=모름 구분, 빈 배열을 불가로 쓰지 않는 규칙까지 있음 |
| 4 | Source Provenance가 충분한가 | **PASS** | `PlaceSourceRecord` envelope = `source`, `sourceDataset`, `sourceId`, `sourceUpdatedAt`, `importedAt`, `verifiedAt`, `verificationStatus`로 task §5-E 최소 후보를 그대로 충족. `(source, sourceDataset, sourceId)` natural uniqueness, `rawReference`로 원천 파일 추적, 서비스 필드는 `evidenceSourceIds`, 필요 시 `fieldSources`. UserReport를 즉시 현재값으로 덮어쓰지 않고 `UNVERIFIED`/`DISPUTED`로 남기는 규칙 명시 |
| 5 | 복수 `contentId` / 복합시설 여지가 있는가 | **PASS** | 초안 §7 자동 병합 금지 + `placeGroupId`/`parentPlaceId`/`relatedPlaceIds` nullable + `RelationStatus`(SUGGESTED→CONFIRMED) 사람 확인 절차. §8.3에서 제주동화마을 3371999(12, N)·4026831(38, Y)을 독립 Place로 유지. CSV 확인 결과 두 레코드는 좌표도 미세하게 다르고 `mlevel`도 6/공백으로 달라 병합 금지 판단이 데이터로도 옳다 |
| 6 | 향후 Data Source 추가가 가능한가 | **PASS** | `source` 허용값에 `KTO`, `VISIT_JEJU`, `TEAM_RESEARCH`, `OWNER_INPUT`, `USER_REPORT`, `OTHER_PUBLIC_DATA` 포함(task §5-E와 일치). Place 1:N PlaceSourceRecord 구조라 출처를 추가해도 기존 KTO 레코드를 덮어쓰지 않는다 |
| 7 | 과도한 정규화/복잡성이 없는가 | **PASS** | 7 Entity. `placeContent`를 별도 분리하지 않고 Place에 흡수한 판단에 근거를 제시했고, tri-state가 많고 독립 검증이 필요한 `PetPolicy`/`AmenityProfile`만 분리했다. 모든 값을 assertion 테이블로 쪼개지 않겠다고 명시. 다만 Matrix의 `ImportMapping` 9행은 스키마가 아닌 적재 별칭이라 불필요한 잡음이다(D-5) |
| 8 | 교육용 팀 Project 수준인가 | **PASS** | 논리 타입 11종, Entity 7종, ER 다이어그램 1장. 보안 규칙·다국어·감사 로그 같은 사업용 요소를 넣지 않았다. Owner 확인 질문 5개로 팀 결정 사항을 분리했다 |
| 9 | Firestore로 구현할 경우 비현실적이지 않은가 | **PARTIAL** | §9는 Firestore를 확정 기술로 가정하지 않고 "최종 결정은 예상 쿼리·인덱스·권한 경계 확인 후"로 열어두었으며, `places/{placeId}` + `sources/{placeSourceId}` subcollection과 tri-state 필터 필드 복제는 현실적이다. 그러나 App `FilterState`는 region·category·dogSize·indoorAllowedOnly·freeParkingOnly·offLeashYardOnly·dogMenuOnly 6개 필터 + `searchQuery`를 동시에 쓴다. Firestore는 문자열 부분검색을 지원하지 않고 다중 필터 조합은 복합 인덱스가 늘어난다. 이 제약이 §9에 없다 |
| 10 | UI가 값 없는 Field를 자연스럽게 숨길 수 있는가 | **PASS** | 초안 §2 "UI는 `null`, `UNKNOWN`, 검증 거절 값을 기본적으로 숨길 수 있다". Matrix에 `ui_candidate` 열이 필드별로 있고 `조건부` 값도 사용. `verificationStatus`로 미검증 값을 노출에서 뺄 수 있다. `publicationStatus`(DRAFT/PUBLISHED/HIDDEN)로 장소 단위 노출도 제어 |
| 11 | 2,126행 + 330 Pet 오버레이 적재 시 의미 왜곡이 없는가 | **PASS** | 1,796건은 `petInformationStatus=UNKNOWN`이고 `petAcceptance`에는 아무 값도 들어가지 않는다. `acmpyTypeCd` → 실내/야외/캐리어 자동 변환이 초안 §1·§5·§8.1·§8.2와 Matrix 비고에서 4중으로 차단된다. 영주산 경도 12.797을 보정하지 않고 `SOURCE_ANOMALY`만 부여. §8.5에서 `SH040300`을 펫 카페로 분류하지 않음을 명시. §5에서 "KTO Pet ∩ 제주 음식점 1건 ≠ 제주 펫 식당 1개"를 정확히 구분. 금지 문장은 어디에도 없다 |

**요약: PASS 9 / PARTIAL 2 / FAIL 0**

### 지시된 추가 점검

| 점검 | 결과 |
|---|---|
| Matrix 열이 task §8과 맞는가 | **충족**. 11개 필수 열 전부 존재 + `group` |
| A/B/C/D 수가 CSV와 맞는가 | **숫자 일치**(26/33/50/27=136). 단 B의 9행이 CSV 컬럼 별칭이라 근거가 약하다(D-5) |
| task §5 App 필드가 모두 있는가 | events/banners·users/favorites 자리 포함 존재. `EventBanner` 자유 텍스트 기간과 `regionName`만 미비(D-6, D-8) |
| field_catalog KTO 필드가 표현되는가 | 50/50 존재. `lclsSystm*`, `mlevel`, `zipcode`, `tel`, 이미지 3종, pet `rela*` 4종 모두 확인 |
| Pet 1,796 unknown이 false로 저장되는가 | 아니다 |
| `acmpyTypeCd`가 실내/야외로 자동 매핑되는가 | 아니다 |
| 영주산 좌표가 "보정"되는가 | 아니다. 원천값 그대로 |
| `SH040300` 쇼핑 Pet을 펫 카페로 보는가 | 아니다 |
| 정책 boolean이 tri-state인가 | 예. 예외 없음 |

---

## 4. 결함 목록

심각도: **blocker** = V1 발행 전 재설계 필요 / **major** = 발행 전 수정 또는 조건 기록 필요 / **minor** = 기록 후 다음 단계에서 처리 가능

### blocker

**없음.**

### major

**D-1 (major) — Sample 8.1이 값이 존재하는 pet `rela*` 5필드를 누락**
근거: `jeju_pet_join.csv` contentId 3401751에는 `pet_relaAcdntRiskMtr`=`12kg 이하 동반 가능`, `pet_relaFrnshPrdlst`=`배변판, 식기, 매너벨트`, `pet_relaPosesFclty`=`안전문, 울타리`, `pet_relaPurcPrdlst`=`화식, 강아지 수제 간식, 매너벨트, 강아지 옷, 장난감 등`, `pet_relaRntlPrdlst`=`강아지 방석`이 있다. 초안 §8.1 sample에는 5개 모두 없다.
왜 major인가: 이 레코드는 제주 330건 중 `relaFrnshPrdlst`·`relaPosesFclty`·`relaPurcPrdlst`(각 2건 중 1건)와 `relaRntlPrdlst`(**전 제주 유일 1건**)를 동시에 보유한 유일한 행이다. 즉 `AmenityProfile`(`fencedYard`←안전문·울타리, `photoZone`←사진공간, `waterBowlProvided`←식기, `wasteBagsProvided`←배변판)을 실제 값으로 검증할 수 있는 단 하나의 기회였다. 초안 §8 전제는 "명시하지 않은 **서비스** 필드는 null/UNKNOWN"이므로 원천 필드 누락은 면제되지 않으며, 읽는 사람이 값이 없다고 오해할 수 있다.
값 자체는 틀리지 않았다. 검증 커버리지 결함이다.

**D-2 (major) — Matrix가 초안 §3에 정의되지 않은 Entity 3종을 사용**
근거: Matrix `entity` 값에 `RegionCodeReference`(3행), `ImportMapping`(9행), `PlaceRelation`(4행)이 있으나 초안 §3의 Entity 목록은 Place / PlaceSourceRecord / PetPolicy / AmenityProfile / EventBanner / User / Favorite 7종뿐이다. `PlaceRelation`은 §7에 개념만 서술돼 있고 Entity 정의·키·ER 다이어그램 표현이 없다. 미정의 Entity 16행 = 전체 136행의 11.8%.
왜 major인가: 지니가 두 산출물을 `DB_SCHEMA_V1_DRAFT.md`로 통합할 때 정의 없는 Entity를 만난다. 또 `relation.*` 4필드가 §7의 `RelationStatus` 흐름을 담는 실체인데 Entity가 없으면 §7 원칙이 구현 가능한 형태로 남지 않는다.

**D-3 (major) — 그룹 B가 스키마 필드가 아닌 CSV 컬럼 별칭 9행으로 과대 집계**
근거: B 33행 중 `ingestAlias.pet_acmpyTypeCd` 등 9행이 JOIN CSV의 `pet_` 접두사 컬럼 별칭이다. 같은 KTO 원천 필드는 이미 `placeSource.kto.pet.*` 9행으로 존재하고, 행크 비고도 "원본 …로 매핑하며 중복 저장하지 않음"이라고 적어 스키마 필드가 아님을 인정한다. 실질 B는 24행이다.
왜 major인가: 이 숫자는 지니가 Owner 보고 §12의 4·5·6항(바로 채울 수 있는 / 일부만 / 향후 수집 필드 수)에 그대로 쓸 값이다. 적재 별칭이 "일부만 채울 수 있는 서비스 필드"로 보고되면 Owner가 현재 데이터 가용성을 실제보다 넓게 이해한다.

### minor

**D-4 (minor) — 해성파크텔 sample `address`가 addr1+addr2 결합값이며 규칙이 없다**
근거: 초안 §8.2 `address: "제주특별자치도 서귀포시 천제연로 158-4 (중문동)"`. CSV는 `addr1`=`제주특별자치도 서귀포시 천제연로 158-4`, `addr2`=`(중문동)`로 분리돼 있다. Matrix `place.address`의 current_source는 `KTO addr1`, 비고는 "초기값은 addr1"이다. sample이 Matrix 규칙과 다르다.
참고: 카페에벤에셀·CU는 `addr1` 자체에 `(노형동)`·`(건입동)`이 들어 있어 KTO가 원천에서 일관되지 않다. 결합 규칙을 정하는 것이 맞고, 정한 뒤 Matrix 비고에 반영해야 한다.

**D-5 (minor) — Sample 표현이 서로 일관되지 않고 존재하는 분류값이 빠진다**
근거: §8.1은 `lclsSystm*`만, §8.2는 `cat*`만 싣는다. 해성파크텔의 raw `lclsSystm1/2/3`은 `AC / AC06 / AC060200`으로 실제 존재한다. 영주산도 `cat1/2/3 = A01 / A0101 / A01010400`, `areacode`=39, `sigungucode`=3이 있으나 sample에 없다. 초안 §5가 "`lcls*`와 `cat*`는 서로 덮어쓰지 않는다"고 한 원칙을 sample이 시연하지 못한다.

**D-6 (minor) — `EventBanner`에 자유 텍스트 기간 필드가 없어 App 배너 1건이 손실된다**
근거: `src/types.ts` `EventBanner.date?: string`. `src/data/banners.ts` 실제 값은 `'2026.09.20 ~ 09.22'`, `'2026.09.15 ~ 10.15'`, `'2026.10.03'`, `'상시 운영'`. 초안은 `startAt`/`endAt` `Instant`만 두었고, `'상시 운영'`은 Instant 2개로 표현할 수 없다.

**D-7 (minor) — `place.secondaryImageUrl`이 Matrix에만 있고 초안 §3.1 Place 필드 목록에는 없다**
근거: Matrix에 `place.secondaryImageUrl`(1910/2126, 그룹 B) 존재. 초안 §3.1 콘텐츠 필드는 `primaryImageUrl`, `tags`, `recommendedPoints`, `cautionNotes`뿐이다.

**D-8 (minor) — `Place.regionName` 대응 필드·파생 규칙이 없다**
근거: `src/types.ts` `Place.regionName: string`. `regionArea` Enum에서 파생 가능하지만 초안에 사전이나 파생 규칙이 없다.

**D-9 (minor) — `PetPolicy` 부재 시 상태 해석 규칙이 없다**
근거: 초안 §3.1 관계는 `Place 0..1 PetPolicy`인데 Matrix `petPolicy.petInformationStatus`의 Coverage는 `2126/2126`이다. 두 서술이 맞물리지 않는다. PetPolicy 레코드가 없는 장소를 UI/쿼리가 어떻게 읽어야 하는지(부재 ≡ 전 필드 UNKNOWN) 규칙이 필요하다.

**D-10 (minor) — 그룹 A에 파생·관리 성격 필드가 섞였다**
근거: `place.coordinateQualityStatus`(적재 시 계산하는 내부 품질 상태)와 `referenceRegion.rnum`(행크 비고 "업무 식별자로 사용하지 않음")이 A에 있다. 전 행 산출 가능이라는 점에서 방어는 되지만 "현재 실제 데이터로 채울 수 있음"의 의미가 흐려진다.

**D-11 (minor) — Firestore 검토가 App 필터·텍스트 검색 제약을 다루지 않는다**
근거: 초안 §9는 컬렉션 배치와 tri-state 복제만 다룬다. `src/types.ts` `FilterState`는 6개 필터 + `searchQuery` 문자열 검색을 동시에 쓴다. Firestore는 부분 문자열 검색을 지원하지 않는다(별도 검색 서비스 또는 클라이언트 필터 필요). 기술 미확정 단계이므로 minor이나, 기술 선택 회의 전에는 채워야 한다.

---

## 5. CONDITIONAL PASS 조건 (지니가 기록·반영)

1. **Entity 정의 보강** — `RegionCodeReference`, `ImportMapping`, `PlaceRelation`을 `DB_SCHEMA_V1_DRAFT.md` Entity 절에 정의하거나, Matrix에서 해당 행의 `entity`를 정의된 Entity로 재배치한다. `PlaceRelation`은 §7 원칙의 실체이므로 정의하는 쪽을 권한다. (D-2)
2. **그룹 재집계** — `ingestAlias.*` 9행을 스키마 필드에서 분리(별도 시트/절 또는 그룹 표기 제외)하고, Owner 보고 §12의 4·5·6항에는 **실질 B = 24**를 쓴다. 총계도 재계산한다. (D-3)
3. **주소 결합 규칙 확정** — `place.address`를 `addr1`만 쓸지 `addr1 + addr2`로 결합할지 정하고, Matrix `place.address` 비고와 §8.2 sample을 같은 규칙으로 맞춘다. (D-4)
4. **`event.dateText` 추가** — 자유 텍스트 기간 필드를 1개 추가해 `'상시 운영'` 같은 값을 보존한다(`startAt`/`endAt`는 유지). (D-6)
5. **`PetPolicy` 부재 해석 명시** — "PetPolicy 레코드가 없으면 모든 정책 필드는 UNKNOWN으로 읽는다"를 초안에 한 줄 추가하고, Matrix `petPolicy.petInformationStatus`의 Coverage 표기를 관계 정의와 맞춘다. (D-9)
6. **`spacePolicy` 어휘 결정을 쟁점으로 등록** — `src/types.ts`에 `SpacePolicy`가 두 가지(`'all'|'indoor'|'indoor_carrier'|'outdoor_only'` vs `PetPolicy.spacePolicy`의 `'indoor_free'|'indoor_carrier'|'outdoor_terrace_only'|'outdoor_and_indoor'`)로 공존한다. 스키마 결함은 아니지만 어느 사전을 정본으로 할지 팀이 정해야 한다. 행크의 Owner 확인 질문에 추가할 것을 권한다.
7. **Firestore 절에 쿼리 제약 한 단락 추가** — `FilterState` 6개 필터 조합의 복합 인덱스와 `searchQuery` 텍스트 검색 대안(클라이언트 필터 또는 외부 검색)을 기술 선택 회의 전에 채운다. (D-11)

조건 1~5는 문서·CSV 수정 수준이고, 6~7은 결정 등록 수준이다. 재설계는 필요하지 않다.

---

## 6. 지니에게 권하는 소규모 수정 (내가 적용하지 않았다)

행크 파일은 그대로 두었다. 아래는 지니가 통합 시 적용할 후보다.

| ID | 대상 파일 | 수정 |
|---|---|---|
| R-1 | `DB_SCHEMA_V1_DRAFT.md` (통합본) | `PlaceRelation`, `RegionCodeReference`, `ImportMapping` Entity 정의 3절 추가. `PlaceRelation`은 ER 다이어그램에도 추가 |
| R-2 | `FIELD_MAPPING_MATRIX.csv` | `ingestAlias.*` 9행의 `group`을 스키마 그룹에서 제외(예: `ALIAS`)하거나 별도 절로 이동. 그룹 합계 주석 갱신 |
| R-3 | 통합본 EventBanner 절 + Matrix | `event.dateText` (Text, 그룹 C, 근거: `src/data/banners.ts`의 `'상시 운영'`) 1행 추가 |
| R-4 | 통합본 Place 절 | `secondaryImageUrl`을 §3.1 콘텐츠 필드 목록에 명기(Matrix에 이미 있음) |
| R-5 | 통합본 §7 또는 sample 8.3 | 제주동화마을 두 레코드의 좌표가 `126.7320377305 / 33.4354329703` vs `126.732037746765 / 33.4354329886865`로 다르고 `mlevel`이 6/공백으로 다르다는 사실 1줄 추가. 자동 병합 금지의 데이터 근거가 된다 |
| R-6 | 통합본 sample 8.1 | 카페에벤에셀의 `relaAcdntRiskMtr` / `relaFrnshPrdlst` / `relaPosesFclty` / `relaPurcPrdlst` / `relaRntlPrdlst` 원문 5줄을 PlaceSourceRecord에 추가하고, `AmenityProfile`은 사람 검증 전이므로 전부 UNKNOWN임을 함께 보여준다 |
| R-7 | 통합본 §2 null/unknown 정책 | "PetPolicy/AmenityProfile 레코드 부재 = 전 필드 UNKNOWN" 1줄 추가 |
| R-8 | 통합본 §9 | Firestore 쿼리 제약 단락 추가(복합 인덱스, 텍스트 검색 부재) |
| R-9 | 통합본 Owner 확인 질문 | `spacePolicy` 정본 어휘 결정 항목 추가(6번째 질문) |

---

## 7. Sample 재매핑 검증 결과 (요약)

상세 표는 `SCHEMA_VALIDATION_REPORT.md` §2에 있다.

| contentId | 장소 | 대조 필드 | MATCH | MISMATCH | OMITTED |
|---|---|---|---|---|---|
| 3401751 | 카페에벤에셀 | 16 | 16 | 0 | 5 (pet `rela*`) |
| 2626708 | 해성파크텔 | 14 | 13 | 1 (`address` 결합) | 3 (`lclsSystm*`) |
| 3371999 | 제주동화마을(관광지) | 4 | 4 | 0 | 0 |
| 4026831 | 제주동화마을(쇼핑) | 5 | 5 | 0 | 0 |
| 2704351 | 영주산 | 9 | 9 | 0 | 5 (`cat*`, 레거시 코드) |
| 3307106 | CU 제주항국제여객터미널 | 11 | 11 | 0 | 2 (`lclsSystm1/2`) |

- 행크가 sample에 **적은** 값 중 원천과 다른 것은 해성파크텔 `address` 1건뿐이다.
- CSV에 없는 `lclsSystm1/2/3` 6건은 raw JSON 전수 파싱으로 확인했고 **전부 일치**한다(FD/FD05/FD050100, NA/NA04/NA040700, SH/SH04/SH040300, NA/NA01/NA010100, SH040300).
- 영주산 `mapx=12.79737228191`은 서비스 `longitude`에도 그대로 보존돼 있다. 보정 흔적 없음.
- `has_pet` → `petInformationStatus` 변환 4건(Y→`KTO_OVERLAY_FOUND` 3건, N→`UNKNOWN` 2건) 모두 정확하며 `petAcceptance`는 전부 `UNKNOWN`이다.
- 값을 발명한 흔적, `src/data/places.ts` 하드코딩 값을 사실로 끌어온 흔적은 없다.

---

## 8. 리뷰어 총평

행크 초안은 이 프로젝트에서 가장 위험한 함정 — 1,796건을 "반려동물 불가"로 만들거나, `acmpyTypeCd`를 실내/야외 정책으로 승격하거나, 영주산 좌표를 조용히 고치거나, 쇼핑 Pet 276건을 펫 카페로 포장하거나, "제주 펫 식당 1개"로 요약하는 것 — 을 모두 피했다. 그 회피가 문장 하나가 아니라 `TriState`·`PetInformationStatus`·`coordinateQualityStatus`·`verificationStatus`라는 구조로 들어가 있고, Matrix 비고에서 반복 강제된다. KTO 관측 필드 50개 손실 0건, task §5 App 필드 보존, provenance 7필드 충족도 확인했다.

남은 문제는 설계 사상이 아니라 두 산출물 사이의 정합성(정의되지 않은 Entity 3종)과 집계 위생(그룹 B의 별칭 9행), 그리고 검증 sample이 가장 값이 풍부한 레코드에서 `AmenityProfile` 증거를 보여주지 못한 점이다. 전부 문서 수정으로 닫힌다. 그래서 REVISE가 아니라 CONDITIONAL PASS다.
