# HANK PLACE CRUD DESIGN — 2026-10-01

## 1. 작성 정보와 설계 판정

- Agent: **Hank** — 현재 Codex 세션에서 수행한 설계·영향 분석.
- Model: **gpt-6-astra (Owner 지정 모델)**. 이 세션에서 런타임의 정확한 model-id를 별도로 반환하는 증거는 확보하지 못했다. 지정값을 독립 실행 로그로 검증한 값이라고 주장하지 않는다.
- 작성일: 2026-10-01, Asia/Seoul.
- 수신: **Geni → 설계 검토**, 승인 후 **Tody → 구현**, 이후 **Annie → 독립 검증**.
- 대상: `tonykks/DANGJEJU_2`, `feature/firestore-place-ui`, 로컬 검토 기준 `03edcd4`.
- 수행: 요구사항·Schema·Rules·Index·TypeScript/Python·기존 테스트 정적 분석, 운영 상태 read-only 조회 시도, Firebase 공식 문서 확인.
- 산출물: **이 설계 문서만 작성**. 앱 코드, Rules, Index, 기존 협업 문서, 운영 데이터는 변경하지 않았다. 구현·배포·Emulator/E2E PASS를 주장하지 않는다.
- 판정: **설계 작성 완료 / 운영 전제 확인은 PARTIAL**. 실제 publicationStatus 분포와 최신 원격 tip은 접근 실패로 미확인이다. 이 불확실성에 의존하지 않는 복원 설계와 후속 확인 절차를 아래에 명시한다.

읽은 기준은 `agent-collab-kit/AGENTS.md`, `PROJECT_INTENT.md`, `STATE.md`, Owner 요청, Geni Rev 1.1 이해 문서, `DB_SCHEMA_DESIGN_TASK.md`, `DECISIONS.md`, Kit README, 기존 `requirement.md`, 실제 Schema V1, 관련 코드와 테스트다. `DB_SCHEMA_DESIGN_TASK.md`는 과거 설계 작업지시이고 실제 enum은 `private_probe/schema_design/DB_SCHEMA_V1_DRAFT.md`에 있다. 9월 STATE/requirement의 create 금지는 10월 Owner CRUD 요청으로 확장됐지만, **이번 Hank 세션은 설계만**이라는 현재 요청을 따른다.

주요 결정은 기존 상태 3개 유지, `manualAdmin`에 복원용 직전 상태 한 항목만 선택적으로 추가, OWNER_INPUT Source 원자적 생성, 공개 조회의 상태 조건 적용, 상태 변경 전용 Rules 경로, 소규모 transaction chunk다. `deleted`, `ACTIVE`, `listView`, 전체 재적재는 도입하지 않는다.

## 2. 현재 운영 publicationStatus: 확인 결과와 재확인 절차

### 2.1 실제 관측한 것

- 로컬 branch는 `feature/firestore-place-ui`, HEAD는 `03edcd4`. 로컬 tracking ref와는 ahead/behind `0/0`이었다. 이는 최신 원격 확인의 증거가 아니다.
- `git fetch origin`은 `.git/FETCH_HEAD: Permission denied`로 실패했다. 별도 `git ls-remote origin refs/heads/feature/firestore-place-ui`도 GitHub 443 연결 실패로 종료됐다. 강제 sync, reset, 우회 접근을 하지 않았다.
- **2026-10-01 13:36:21 UTC / 22:36:21 KST**에 기존 Python venv의 Google ADC를 사용하여 `dangjeju / (default) / places`에 대한 read-only count 조회를 시도했다.
- 준비한 요청은 전체 수 및 `DRAFT`, `PUBLISHED`, `HIDDEN`별 `runAggregationQuery(count)`다. ADC refresh에서 **TransportError**로 중단되어 Firestore 집계 응답을 받지 못했다. 토큰, 이메일, UID, credential 본문은 출력하거나 저장하지 않았다. 운영 write는 0건이다.
- 따라서 **현재 총수, DRAFT 수, PUBLISHED 수, HIDDEN 수, 누락/잘못된 값 수는 모두 미확인**이다. 2,126은 Owner 문서와 과거 import의 기준 건수이며 이번 실측 건수가 아니다. HIDDEN이 0건이라고도 단정하지 않는다.

### 2.2 코드에서 확인한 과거 초기값

`tools/firestore_place_pilot_import/import_pilot.py:201`은 Place 초기 상태를 `DRAFT`로 만든다. 같은 변환을 쓰는 `import_full.py`는 KTO Place/Source 쌍을 적재한다. 그러나 현재 public Rules와 `loadHeroPlaces`/`searchPlaces`에는 상태 필터가 없으므로, **DRAFT가 화면에 보이는 기존 동작**과 import 초기값은 모순되지 않는다. 이것만으로 현재 운영 분포를 추론하면 안 된다.

### 2.3 Geni/Tody가 권한 있는 환경에서 끝낼 확인

1. 기존 인증만 사용하여 전체 `count()`를 읽고, 같은 `readTime`의 세 상태별 equality `count()`를 읽는다. 결과에 프로젝트, DB, 시각, 각 count, 총합을 기록한다. 상세 Place/Source 전체를 출력하지 않는다.
2. `전체 - DRAFT - PUBLISHED - HIDDEN`이 0인지 확인한다. 0이 아니면 관리자 권한으로 `publicationStatus`만 projection하여 누락/null/그 외 값을 구분한다. 이는 일회성 운영 조사이며 브라우저 Catalog 선로딩 경로로 구현하지 않는다.
3. 기존 HIDDEN이 있으면 해당 문서의 복원 근거 유무를 조사한다. 근거 없는 HIDDEN은 무조건 DRAFT로 복원하지 않는다. 아래 상태 모델은 앞으로 이 기능으로 숨기는 문서의 원상복원을 보장한다.
4. 필터 전환 전 `search.version=1` 및 region/category 필드 누락으로 빠지는 문서가 있는지도 필요한 범위에서 확인한다. 이상값이 있으면 대상·영향만 보고하고 무단 전체 보정은 하지 않는다.
5. 통신·quota 실패 시 중단하고 미확인을 유지한다. 새 credential 발급, 반복적인 전수 조회, import `--apply`는 필요 없다.

집계는 전체 문서를 전송하지 않고 count 결과를 돌려주는 read 작업이다. [Firebase 집계 쿼리](https://firebase.google.com/docs/firestore/query-data/aggregation-queries).

이 결과를 받기 전에도 혼합 상태 fixture로 구현과 Emulator 검증은 진행할 수 있다. **운영 데이터가 전부 DRAFT라는 전제의 최적화·일괄 복원·공개 필터 배포는 금지**한다.

## 3. 기존 Schema 재사용과 Soft Delete / Restore

### 3.1 상태 의미

기존 `PublicationStatus = DRAFT | PUBLISHED | HIDDEN`을 그대로 쓴다.

- `DRAFT`: 기존 데이터 상태를 보존한다. 이번 CRUD에서는 기존 서비스 호환성을 위해 공개 조회에 포함한다. 새로운 비공개 초안 workflow를 의미하지 않는다.
- `PUBLISHED`: 공개 조회에 포함한다. 새 장소 등록의 기본 상태는 `PUBLISHED`로 정한다. 등록 즉시 검색 가능한 Owner 요구에 맞으며 새 draft/publish 버튼은 만들지 않는다.
- `HIDDEN`: 삭제 처리된 장소. 일반 화면과 비관리자 데이터 조회에서 제외하고 관리자만 조회·수정·복원한다.

따라서 공용 `PUBLICATION_VISIBLE_STATUSES = ['DRAFT', 'PUBLISHED']`를 Query와 표시 검증에서 같이 쓴다. 실제 운영 분포를 모르는 상태에서 PUBLISHED만 조회하면 기존 장소가 사라질 수 있다. 누락/잘못된 값은 정상 상태로 간주하지 않고 위 사전 조사에서 처리한다.

### 3.2 복원을 위해 필요한 최소 정보

**선택안: `manualAdmin.previousPublicationStatus?: 'DRAFT' | 'PUBLISHED'` 한 항목 추가.** 삭제 여부는 계속 `publicationStatus` 하나로 판정한다. 이 항목은 복원 목적의 감사 metadata이며 새 삭제 flag가 아니다.

기존 6개 audit 키(`source`, `updatedAt`, `changedFields`, `changedTopLevel`, `managedFields`, `clearedFields`)를 보존하고, 이 기능으로 숨긴 동안에만 위 7번째 키를 둔다. 신규 collection이나 2,126건 backfill은 필요 없다. 기존 audit가 없는 Place에는 해당 문서의 첫 상태 변경 때만 생성한다.

HIDDEN 하나만 저장하면 서로 다른 DRAFT/PUBLISHED를 구별할 정보가 사라진다. 현재 전부 DRAFT로 확인되더라도 앞으로 PUBLISHED 신규 등록이 섞이므로 **고정 DRAFT 복원은 채택하지 않는다**. 브라우저 메모리/localStorage에만 직전 상태를 보관하는 방식도 재로그인·다른 관리자 복원을 보장하지 못한다.

### 3.3 허용 전이와 원자적 patch

정상 → 삭제:

```text
before.publicationStatus ∈ {DRAFT, PUBLISHED}
after.publicationStatus = HIDDEN
after.manualAdmin.previousPublicationStatus = before.publicationStatus
after.manualAdmin.source = ADMIN_UI
after.manualAdmin.changedFields = [publicationStatus]
after.manualAdmin.changedTopLevel = [publicationStatus]
after.manualAdmin.managedFields = 기존 managed 집합 ∪ {publicationStatus}
after.manualAdmin.clearedFields = 기존 clearedFields (순서·값 보존)
after.manualAdmin.updatedAt = serverTimestamp()
after.updatedAt = serverTimestamp()
```

삭제 → 복원:

```text
before.publicationStatus = HIDDEN
before.manualAdmin.previousPublicationStatus ∈ {DRAFT, PUBLISHED}
after.publicationStatus = before.manualAdmin.previousPublicationStatus
after.manualAdmin.previousPublicationStatus = 필드 제거
나머지 audit는 위와 같은 상태 변경 규칙 적용
```

- `changedFields`/`changedTopLevel`은 이번 동작을, `managedFields`는 누적 관리 범위를 나타낸다. 과거 legacy audit에 managed가 없으면 이전 changed/cleared 항목의 유효 집합을 정규화해 이어받는다. 서버 Rules와 client가 같은 정규화 규칙을 사용해야 한다.
- **`search` 전체와 `derivedAt`/`inputHash`, 모든 표시값, createdAt, Source, Favorite는 변경하지 않는다.** 현재 TS/Python hash 입력에 publicationStatus/audit 시각은 없으므로 상태만 바뀌면 재계산이 불필요하다.
- `HIDDEN → HIDDEN`, 이미 정상인 장소의 복원은 재기록하지 않고 `이미 처리됨`으로 분류한다. 직전 상태를 HIDDEN으로 덮어쓰지 않는다.
- `DRAFT ↔ PUBLISHED` 직접 변경 기능은 이번 범위에 없다. 상태 변경과 일반 정보 편집도 한 저장에 섞지 않는다.
- 기존 HIDDEN의 previous 상태가 없거나 잘못됐으면 `복원 근거 없음`으로 처리하고 해당 항목만 복원을 막는다. 과거 로그/백업 등으로 확인되지 않은 상태를 추측하지 않는다.
- HIDDEN 상태에서 일반 필드 편집은 허용하되 previous 상태를 그대로 보존한다. **현재 `buildAdminEditPlan`은 manualAdmin을 새로 만들므로 이 키를 유실시키지 않도록 보완해야 한다.** 복원 후 재삭제하면 그때의 상태를 다시 저장한다.

## 4. Source / Provenance와 신규 Place 생성

### 4.1 KTO와 OWNER_INPUT의 구분

기존 `places/{placeId}/sources/{placeSourceId}` 구조를 유지한다. `source`는 Source 문서의 출처이고, Place에 중복 `source` 필드를 신설할 필요가 없다. 기존 연결값인 **`Place.search.primarySourceId`**를 사용한다. 별도의 root `primarySourceId`도 만들지 않는다.

- KTO Source는 create/update/delete 모두 client에서 금지한다. 기존 KTO Place의 편집·숨김·복원은 Source를 한 바이트도 변경하지 않는다.
- 새 장소는 OWNER_INPUT Source와 Place를 **같은 transaction에서 처음 한 번 생성**한다.
- OWNER_INPUT Source는 이번 범위에서 **create-only**다. 이후 서비스값 수정은 Place와 기존 `manualAdmin`에 저장하며 Source update/delete를 열지 않는다.
- 기존 KTO Place에 OWNER_INPUT Source를 추가하거나 primarySourceId를 바꾸는 작업은 이번 신규 등록 기능이 아니다. 허용하지 않는다.

### 4.2 생성 Source envelope

아래 `<uuid>`는 동일 생성 작업에서 한 번 만든 UUID다. timestamp는 실제 저장 시 `serverTimestamp()`이며 문자열이 아니다.

```text
path: places/owner-<uuid>/sources/owner-input-<uuid>
placeSourceId: "owner-input-<uuid>"
placeId: "owner-<uuid>"
source: "OWNER_INPUT"
sourceDataset: "admin-place-create-v1"
sourceId: "<uuid>"
sourceUpdatedAt: serverTimestamp()
importedAt: serverTimestamp()
verifiedAt: null
verificationStatus: "UNVERIFIED"
rawReference: null
```

이 10개 키만 허용한다. `sourceId`는 외부 KTO contentId가 아니라 OWNER_INPUT 입력 사건의 시스템 식별자다. `sourceUpdatedAt`은 이 입력이 작성된 시각을 알 수 있으므로 생성 시각을 쓴다. 이후 Place 편집 시 원래 생성 사건의 시각을 바꾸지 않는다. KTO의 `collector.hasPetJoin`, `kto`, raw 파일 경로, contentId를 흉내내어 채우지 않는다. Place 전체의 중복 raw 사본도 만들지 않는다. 현재값은 Place, 출처 연결은 Source envelope, 편집·clear 이력의 최신 요약은 manualAdmin의 기존 역할이다.

원본 `VerificationStatus` enum은 **UNVERIFIED / VERIFIED / DISPUTED / REJECTED / STALE**다. 관리자가 등록했다는 사실만으로 독립 사실 검증까지 완료됐다고 보지 않아 `UNVERIFIED + verifiedAt:null`을 선택한다. `ADMIN_CONFIRMED`는 현재 Pet/좌표의 관리자 보완 상태에서만 사용하는 값이며 **Source verificationStatus에 넣지 않는다**. VERIFIED로 전환하는 별도 검증 workflow는 이번 범위에 없다.

공개 Place/Source와 audit 어느 곳에도 관리자 UID, 이메일, 이름 등 개인정보성 관리자 식별자를 넣지 않는다. 로그인 UID는 Auth/`admins/{uid}` 권한 검사에만 사용한다. `createdBy`, `updatedBy`, `verifiedBy` 같은 새 공개 필드도 허용하지 않는다.

### 4.3 Create builder와 원자성

1. 기존 `ADMIN_FIELD_DEFINITIONS`와 parser를 재사용한다. 신규 폼은 `name`, 4개 중 `regionArea`, 8개 중 `serviceCategory`를 필수 입력으로 받는다. 기존 필드 선택 체크박스는 Update의 선택 저장 UX이므로 신규 폼과 목적을 구분한다.
2. 선택 입력의 초기값은 기존 Schema대로 null/UNKNOWN이다. 좌표는 두 값 모두 제주 유효 범위이거나 모두 null이어야 한다. null이면 `coordinateQualityStatus=MISSING`, 유효 입력이면 기존 편집 계약의 `ADMIN_CONFIRMED`를 사용한다. 좌표 없는 장소의 목록/상세는 정상 표시하고 지도 마커는 기존 결측 처리를 따른다. 지도 표시 E2E는 유효 좌표 fixture로 검증한다.
3. petPolicy는 기존 19개 키, amenities는 7개 키의 형태를 유지한다. 반려동물 사실 입력이 없으면 `petInformationStatus=UNKNOWN`; 실제 정책/상세 입력이 있으면 기존 편집 의미대로 `ADMIN_CONFIRMED`. 빈 기본값을 입력한 것으로 세어 자동 확인 처리하지 않는다. UNKNOWN은 동반 불가가 아니다.
4. 기존 pet 상세 입력은 `adminOverrides.petDetails`를 그대로 사용한다. 표시용 placeholder나 KTO 코드/분류를 OWNER_INPUT 사실로 저장하지 않는다.
5. Source envelope → Place 서비스값 → `deriveSearchFields`를 구성한다. `search` 14개 키, 기존 version/scoreVersion, 연결 ID, hash, server derivedAt을 만든다. manualAdmin은 실제 입력한 editable field 목록을 자동 기록하고 UID는 넣지 않는다. `createdAt`/`updatedAt`도 server timestamp다.
6. transaction에서 Place와 Source의 부재를 모두 읽은 후 두 문서를 생성한다. 한쪽만 저장되는 경로는 없다. Rules의 상호 `getAfter()` 검사로 client를 우회한 단독 생성도 차단한다.
7. 중복 클릭은 같은 생성 작업 ID를 유지하고 저장 버튼을 잠근다. 실패했다고 UUID를 무조건 새로 만들어 중복 장소를 생성하지 않는다. 응답 유실은 같은 ID 두 문서를 관리자 권한으로 재조회해 확인하며, 기존 문서가 다르면 충돌로 처리한다. 완전히 새 등록을 시작할 때만 새 UUID를 발급한다.

## 5. KTO 전용 가정과 실제 코드 영향

### 5.1 `src/lib/placeAdapter.ts`

- `adaptPlace`의 `/^kto-\d+$/` 검사(`109`행 부근)를 공통 KTO/OWNER ID validator로 바꾼다. `document.id === data.placeId` 검사는 유지한다.
- Source를 KTO만 모아 사전순 첫 항목으로 고르는 경로(`113`행 부근)는 `search.primarySourceId`와 canonical path/IDs를 먼저 검증하게 한다. 연결된 source가 KTO일 때만 kto fallback을 사용하고 OWNER_INPUT에서는 빈 KTO 객체로 서비스값과 adminOverrides를 해석한다.
- 명시 clear → Place 서비스값 → 실제 KTO fallback → placeholder 우선순위를 유지한다. OWNER_INPUT의 KTO fallback은 존재하지 않는다. 관리자 Pet label은 기존대로 유지하며 OWNER_INPUT을 KTO 확인으로 표시하지 않는다.
- 공개 목록 변환 진입점(`adaptPlaceDocs`, 필요하면 `joinPlacesCatalog`)에도 정상 상태 검사를 둔다. 관리자는 CatalogDocument를 사용해 HIDDEN을 편집하므로 범용 adapter 한 함수에서 무조건 HIDDEN 예외를 던져 관리 화면까지 깨뜨리지 않는다.

### 5.2 `src/lib/placeSearch.ts`

- `loadPlacesByIds:96`의 KTO-only ID 필터를 공통 validator로 바꾼다.
- Home/조건 검색에는 공개 상태 `in`을 추가한다. Favorite resolver는 ID+공개 상태 조건 query로 바꿔 HIDDEN 한 건 때문에 `Promise.all(getDoc)` 전체가 permission-denied가 되는 일을 피한다.
- 현재 `getPlace`를 공개 조회와 관리자 원문 조회로 명확히 분리한다. 예: `getPublicPlace`는 documentId equality+정상 상태 query, `getAdminPlace`는 관리자 경로의 `getDoc`. 기존 이름을 유지한다면 import/callsite 전부의 의미를 검토한다.
- `guardedFirestoreRead`와 quota cooldown을 유지한다. 누락/숨김은 빈 결과이고 quota/권한/네트워크 장애는 오류다. 모든 오류를 "없는 장소"로 삼키지 않는다.

### 5.3 `src/lib/adminPlaceEditor.ts`

- `loadAdminPlace:131`의 KTO 필수 검사를 `KTO | OWNER_INPUT` Source 검증으로 바꾼다. Source `placeSourceId`, `placeId`, path, `search.primarySourceId` 일치를 확인한다. 임의 source 이름을 모두 허용하는 완화가 아니다.
- 기존 `saveAdminPlace`의 updatedAt revision 검사와 nested leaf patch를 보존한다. 숨김 상태도 관리자 원문 loader로 읽을 수 있어야 한다.
- parser/default builder를 Create에서 재사용하되 KTO 가짜 Source나 fake imported Place를 만들어 기존 edit plan에 끼우지 않는다.
- `buildAdminEditPlan`이 optional previousPublicationStatus와 누적 audit를 유지하도록 수정한다. 일반 edit의 changedFields에 publicationStatus를 사용자가 넣을 수 없어야 한다.
- Create/상태 transaction/조건 조회는 분리된 함수로 구현한다. 기존 all-edit 저장에 상태 전이와 두 문서 생성을 억지로 합치지 않는다.

### 5.4 `src/lib/searchDerivation.ts`와 Python parity

현재 `presentScores:174–179`는 `UNKNOWN`이면 `collector.hasPetJoin === 'N'`을 요구한다. collector가 없는 정상 OWNER_INPUT은 이 검사에서 실패한다. `tools/firestore_place_search_fields/derive.py:276` 부근에도 같은 전제가 있다.

- Source 종류를 명시적으로 분기한다. KTO의 JOIN Y/N 및 pet object 정합성 검사는 그대로 둔다.
- OWNER_INPUT은 KTO_OVERLAY_FOUND를 거부한다. UNKNOWN은 collector/kto 없이 허용하고 petScore=0, petTier=UNKNOWN이다. ADMIN_CONFIRMED는 실제 관리자 상세 입력으로 기존 effectivePetDetails 점수를 계산한다.
- 정규화/hash/score 산식을 TS와 Python 모두에서 동일하게 확장한다. 기존 KTO fixture 결과와 hash는 변하지 않아야 한다. source.type 누락을 OWNER_INPUT으로 간주하는 우회는 금지한다.
- OWNER_INPUT에는 KTO contentTypeName, addr2, zipcode 점수가 없으므로 해당 항목은 0점이다. 점수를 맞추려고 KTO 값을 위조하지 않는다. serviceCategory/regionArea는 기존 SERVICE_CATEGORY/SERVICE_REGION 파생 근거를 사용한다. 기존 scoreVersion과 임계값을 바꾸거나 전체 backfill하지 않는다.
- 현재 petScore는 주로 9개 상세정보의 풍부도를 센다. 구조화 정책만 입력한 ADMIN_CONFIRMED가 BASIC/0점일 수 있는 기존 의미를 유지한다. Hero는 신규 장소라고 자동 출현하지 않고 기존 `totalScore >= 12` 및 상위 5개 조건을 만족해야 한다.
- `tools/firestore_place_search_fields/recompute.py:42–49`는 Place당 Source 하나와 정확히 2,126개씩의 snapshot을 전제한다. 이 과거 일괄 도구를 신규 OWNER_INPUT 생성 경로에서 호출하지 않는다. 이번에 도구 전체를 OWNER_INPUT 적재기로 바꾸지 않고 KTO 범위가 명시된 작업은 그대로 제한한다. 향후 범용 재계산 경로는 primarySourceId로 두 Source 종류를 구분하고 고정 개수 가정을 별도 제거해야 한다.

### 5.5 `src/lib/effectivePlace.ts`와 누락되기 쉬운 경로

`objectValue(undefined) → {}`와 명시 clear/관리자 상세 override가 이미 있어 fallback 기본 구조는 재사용 가능하다. 다만 `effectivePetDetails`가 `source.kto.pet`를 출처와 무관하게 읽지 않도록 KTO branch를 명확히 한다. OWNER_INPUT에는 kto를 저장하지 않아도 정상 동작해야 한다.

`src/hooks/usePlaceQueries.ts`의 Favorite 캐시는 기존 ID를 다시 읽지 않으며 `enrichPlaceWithSource`도 캐시된 Place를 신뢰한다. `src/App.tsx:80` 부근은 상세를 먼저 열고 enrichment 실패 시 기존 내용을 유지한다. **이 세 경로를 함께 고치지 않으면 hide 이후에도 상세/찜이 남는다.** 9절의 재검증 계약을 따른다.

`placesCatalog.ts`와 `usePlacesCatalog.ts`에는 KTO regex, collectionGroup Source query, 전체 Place load가 남아 있다. 현재 `App`은 `usePlaceQueries`를 사용하고 이 legacy hook은 연결되지 않는다. 이 전체 loader를 확장·재연결하지 않는다. 테스트는 순수 adapter/cache 회귀와 현재 Query-first 통합을 구분하고, 공개 무제약 Catalog query를 허용하는 테스트 기대는 바꿔야 한다.

기존 import의 `kto-*` 검증은 **KTO 적재 도구의 의도된 범위 제한**이다. `import_full.py`의 200문서 chunk, KTO-only ID/Source 검사, CSV 전체 수 비교를 CRUD에 재사용하거나 느슨하게 바꾸지 않는다. 새 OWNER_INPUT이 추가된 뒤 과거 global-count=CSV 검증은 전체 서비스 inventory 검증으로 사용할 수 없다. import 재실행으로 CRUD 상태를 덮어쓰지 않는다.

## 6. 신규 Place ID 정책

- 기존: `kto-<숫자 contentId>` 및 기존 KTO Source ID 유지.
- 신규: **`owner-<crypto.randomUUID()의 소문자 UUID v4>`**.
- 신규 Source document ID: **`owner-input-<같은 UUID>`**. 다른 Place의 Source와 연결하지 않는다.
- 공통 validator는 기존 `^kto-[0-9]+$` 또는 `^owner-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`만 허용한다. 임의 문자열/슬래시/경로 조작은 거부한다.
- sourceId는 같은 UUID 문자열, placeSourceId는 Source document ID로 역할을 구분한다. UUID 랜덤성만 신뢰하지 않고 transaction 부재 검사로 기존 문서 overwrite를 막는다.
- 공개 목록, 상세, 관리자 loader, Favorite resolver, Rules, 테스트가 같은 지원 범위를 사용한다. Favorites document schema는 변경하지 않는다.
- ID·Source·해시·점수는 자동 생성한다. 관리자 폼에 입력칸을 만들지 않는다.

## 7. 관리자 지역(4) × 업종(8) 조회와 선택

정식 Query 값은 지역 `JEJU_CITY / SEOGWIPO_CITY / EAST / WEST`, 업종 `ATTRACTION / CAFE / FOOD / SHOPPING / STAY / LEISURE / CULTURE / EVENT`다. 기존 `search.region/category` 및 UI mapping을 재사용한다. 두 조건이 모두 선택되기 전 지역 목록 query를 실행하지 않는다.

관리자 지역 조회의 정확한 shape:

```text
collection(places)
where(search.version == 1)
where(search.region == 선택 지역)
where(search.category == 선택 업종)
정상 탭: where(publicationStatus in [DRAFT, PUBLISHED])
삭제 탭: where(publicationStatus == HIDDEN)
orderBy(name, asc)
orderBy(documentId(), asc)
limit(100)
다음 페이지: startAfter(lastDocumentSnapshot)
```

100은 페이지 크기이며 조회 총수 제한이 아니다. `다음 결과`/`더 보기`로 끝까지 관리할 수 있다. 12개 제한은 **기존 이름 접두검색만** 유지한다. 이름 검색은 기존 name bounds, name asc, limit 12의 별도 단일 장소 찾기 경로로 유지하며 정상/HIDDEN 상태를 배지로 구분하고 양쪽 모두 관리자 편집 진입이 가능하게 한다. 지역 다중 관리용 목록을 이름 검색 12개로 잘라 사용하지 않는다.

- 개별 선택/선택 해제와 선택 수를 제공한다. 선택 키는 이름이 아니라 placeId다.
- `현재 표시된 항목 선택`과 **`현재 조건 전체 선택`**을 구분한다. 후자는 남은 페이지를 같은 조건으로 명시적으로 읽어 완료한 다음 실제 ID를 확정한다. 읽기 중 실패하면 전체 선택 완료로 표시하지 않는다.
- 현재 조건 전체 읽기는 관리자가 선택한 한 region/category/status 조합에만 한정한다. 초기 화면 전체 Catalog load나 브라우저의 32조합 자동 전수 읽기는 하지 않는다.
- 필터/탭/검색 방식 변경 시 선택을 비운다. 조회 도중 이전 요청의 응답이 나중에 도착해 새 목록·선택을 덮어쓰지 않도록 request generation을 둔다.
- pagination 중 타 관리자가 이름/지역/상태를 바꿀 수 있다. 중복 ID는 제거하고, 선택 목록은 수집된 문서 snapshot 기준임을 표시한다. 전 DB의 한 시점 snapshot이라고 주장하지 않는다. 실제 저장 전 revision/현재 조건 검사를 다시 한다.
- 확인창에는 동작, 실제 대상 수, 대상 장소명·지역·유형, 데이터가 물리 삭제되지 않음을 보여준다. 복원은 DRAFT/PUBLISHED별 대상 수를 함께 확인할 수 있어야 한다. `전체 선택`이라는 UI 상태만 보고 다시 서버 전체 조건을 쓰는 방식은 금지한다.

## 8. 일괄 Soft Delete / Restore의 안정성

### 8.1 선택 전략: 5개 Place씩 순차 transaction

SDK의 WriteBatch와 transaction write 상한은 **500**이다. 하지만 이 프로젝트는 1,000-expression 실패 이력이 있고 Rules document access 제한도 있다. 따라서 `500개씩 writeBatch.update()`를 기본값으로 삼지 않는다. [Firestore Lite API](https://firebase.google.com/docs/reference/js/firestore_lite).

**기본 chunk=5 Place, 동시 chunk=1, transaction maxAttempts=3**을 제안한다. 각 chunk에서 Place를 모두 먼저 읽고, 저장할 대상만 `transaction.update`한다. Source read/write는 없다. 일반 writeBatch는 read 이후 경쟁 수정 검사를 제공하지 않아 기존 revision 계약을 지키는 transaction을 선택했다. [원자적 쓰기와 transaction](https://firebase.google.com/docs/firestore/manage-data/transactions).

Rules의 `get/exists/getAfter`는 각 operation 10회, transaction 전체 20회 제한이며 식 평가는 요청당 1,000개다. 현재 관리자 확인의 get+exists를 캐시하지 않는 보수적 계산에서도 5개 read와 5개 update × 최대 2번 관리자 접근은 20회다. 실제 중복 접근은 캐시될 수 있으나 이를 전제로 chunk를 늘리지 않는다. **5개가 expression 한도까지 자동 통과한다는 뜻은 아니며, 반드시 완성 Rules의 worst-case Emulator 결과로 확정한다.** 실패하면 validator 중복을 줄이거나 1개로 낮춘다. [Firestore 한도](https://firebase.google.com/docs/firestore/quotas).

### 8.2 동시 변경과 재시도

1. 확인창을 열 때 IDs, 각 updatedAt revision, publicationStatus, previous 상태, region/category를 고정한다.
2. 각 transaction에서 최신 문서를 읽고 고정 snapshot과 비교한다. 현재 탭/조건에서 벗어나거나 편집 revision이 바뀌면 그 항목은 `충돌 — 다시 확인 필요`로 두고 쓰지 않는다. SDK의 내부 재시도에서도 같은 확인 기준을 유지한다.
3. 이미 목표 상태인 대상은 `이미 처리됨`, 없는 문서는 `찾을 수 없음`, 복원 근거 없는 HIDDEN은 `복원 불가`로 분류한다. 다른 항목은 같은 chunk에서 진행할 수 있다.
4. transaction callback 안에서 성공 수/화면 상태를 누적하지 않는다. callback은 재실행될 수 있다. commit 성공 후에만 결과를 확정한다.
5. permission-denied 등 확정 거부라면 해당 chunk의 예정 write는 모두 실패다. 네트워크 단절로 commit 응답이 불명확하면 실패라고 단정하지 않고 관리자 재조회로 확인한다.
6. 재조회 후 목표 상태이면 `현재 상태 확인됨`으로 보고하되 다른 관리자가 바꿨을 가능성이 있으므로 우리 commit 성공으로 단정하지 않는다. 재조회도 실패하면 `확인 필요`로 남긴다. 별도 persistent operation 로그를 새로 만들지 않아 exactly-once 작업 이력 증명은 제공하지 않는다.
7. quota/cooldown, 인증 상실, 전반적 권한 오류면 후속 chunk를 중단하고 미시도 수를 남긴다. 구조적인 거부를 수백 번 재시도하지 않는다. 새로고침 뒤에도 같은 복원을 무조건 재실행하지 않고 현재 상태와 revision으로 다시 확인한다.

### 8.3 부분 성공 UI 계약

전체 선택을 하나의 원자적 작업이라고 표시하지 않는다. 원자성 단위는 chunk다. 앞 chunk 성공 후 뒤 chunk 실패 시 이미 성공한 항목을 자동 롤백하지 않는다. 롤백이 다른 관리자 작업을 덮어쓸 수 있다.

각 ID의 결과는 `commit 성공 / 이미 처리됨 / 상태 확인됨 / 충돌 / 확정 실패 / 확인 필요 / 미시도` 중 하나로 관리한다. **모든 분류의 합은 최초 확정한 선택 수와 같아야 한다.** 실패/충돌 이유와 대상 행을 보여주고, 재시도는 재조회·확인한 미완료 항목만 대상으로 한다. 성공한 chunk의 ID는 캐시에서 무효화하고 목록을 재조회한다. 종료/취소는 다음 chunk부터 멈추며 전송된 commit을 취소했다고 표시하지 않는다.

문서 크기/요청 크기도 검사한다. 상태 patch만 쓰고 Source·Place 전체 payload를 전송하지 않는다. 임의의 고정 큰 chunk를 500 이내라는 이유만으로 안전하다고 판단하지 않는다.

## 9. 공개 Query / Index / HIDDEN 차단

### 9.1 공개 Query

모든 public list query에 `where('publicationStatus', 'in', ['DRAFT', 'PUBLISHED'])`를 넣는다. `!= HIDDEN`은 누락값을 포함하는 만능 필터가 아니며 inequality 정렬 문제를 더하므로 채택하지 않는다. 반환 후 HIDDEN만 지우는 방식은 Hero limit 앞의 HIDDEN 때문에 상위 5개가 부족해져 채택하지 않는다.

- **Hero**: 상태 in + search.version==1 + totalScore>=12 + totalScore desc + documentId desc + limit5. 서버가 정상 장소에서 상위 5개를 고른다.
- **지역 검색**: 상태 in + search.version==1 + region/category equality + petSortKey desc + documentId desc. 기존 결과 범위·풍부도 순서와 Map/List 동일 배열 계약을 유지한다.
- **Favorite Place resolve**: 중복 제거·검증한 ID를 **10개씩** `where(documentId(), 'in', ids)` AND 상태 in으로 조회한다. 반환 순서는 saved IDs 순서로 복원한다. 두 IN의 DNF는 10×2=20으로 30 이하다. 숨김/없는 Place는 반환되지 않으며 **Favorite 문서 자체는 삭제하지 않는다**. [복합 쿼리 제한](https://firebase.google.com/docs/firestore/query-data/queries).
- **상세 진입**: public `documentId == id` AND 상태 in, 최대 1개의 서버 결과로 가시성을 먼저 확인한다. query 결과가 없으면 상세를 열지 않고 기존 선택과 cache를 제거한다. 그 뒤에만 해당 primary Source를 읽는다. 임의의 hidden document get은 Rules에서도 거부한다.
- **관리자**: public loader를 재사용하지 않는다. raw document get과 7절 query를 사용한다. 관리자로 로그인했더라도 일반 사용자 화면의 query 조건은 그대로 적용해 HIDDEN이 섞이지 않게 한다.

Rules는 결과를 알아서 필터링하는 기능이 아니므로 public query가 Rules의 정상 상태 조건을 증명해야 한다. [Rules와 Query의 관계](https://firebase.google.com/docs/firestore/security/rules-query).

### 9.2 필요한 composite index 제안

현재 `firestore.indexes.json`에는 KTO sources group 1개와 places 검색/hero 2개가 있다. 기존 index는 이번에 삭제하지 않는다. 다음 **places/COLLECTION 3개를 추가**한다. 아래는 변경 제안이며 실제 파일은 수정하지 않았다.

```json
[
  {
    "collectionGroup": "places",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "publicationStatus", "order": "ASCENDING" },
      { "fieldPath": "search.version", "order": "ASCENDING" },
      { "fieldPath": "search.region", "order": "ASCENDING" },
      { "fieldPath": "search.category", "order": "ASCENDING" },
      { "fieldPath": "search.petSortKey", "order": "DESCENDING" }
    ]
  },
  {
    "collectionGroup": "places",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "publicationStatus", "order": "ASCENDING" },
      { "fieldPath": "search.version", "order": "ASCENDING" },
      { "fieldPath": "search.totalScore", "order": "DESCENDING" }
    ]
  },
  {
    "collectionGroup": "places",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "publicationStatus", "order": "ASCENDING" },
      { "fieldPath": "search.version", "order": "ASCENDING" },
      { "fieldPath": "search.region", "order": "ASCENDING" },
      { "fieldPath": "search.category", "order": "ASCENDING" },
      { "fieldPath": "name", "order": "ASCENDING" }
    ]
  }
]
```

마지막 `__name__`의 기본 정렬 방향은 마지막 정렬 필드와 같다. 따라서 동일 점수/이름의 순서를 확정하는 ID 정렬도 public은 desc, admin은 asc로 맞춘다. Query 필드는 `documentId()`를 사용하고 저장 데이터에 `__name__`을 추가하지 않는다. [Firestore index 정렬](https://firebase.google.com/docs/firestore/query-data/index-overview).

Favorite/detail ID query는 자동 publicationStatus single-field index와 document name을 사용하는 형태로 검증한다. 전용 composite index를 추측으로 늘리지 않는다. 기존 이름 접두검색도 name single-field를 유지한다. 위 세 후보와 실제 client query를 같은 fixture로 확인하고, 실제 서비스에서 missing-index 응답이 있으면 해당 query를 근거로 보완한다. **Emulator PASS만으로 운영 composite index가 불필요하거나 READY라고 판정하지 않는다.**

운영 반영은 별도 승인 후 index READY → query 대응 frontend/Rules의 호환성을 조정한 배포 → read-only smoke 순서다. 먼저 엄격한 read Rules만 배포하면 구버전 frontend의 무상태 query가 거부된다. 새 query client가 READY index를 사용하는 전환 계획과 기존 열린 탭의 새로고침 안내를 같이 준비한다. 이 설계 단계에서는 index 생성/Rules/Hosting/Pages 배포를 하지 않는다.

### 9.3 캐시·상세·화면 반영

- 상세는 현재의 `캐시 Place로 먼저 표시하고 실패하면 유지`를 바꿔 **서버 가시성 확인 전 loading**으로 둔다. Source 오류와 Place 비공개/조회 오류를 구분한다. Place 검증 실패 때 옛 상세를 남기지 않는다.
- Favorite drawer를 열 때, refresh할 때, 계정이 바뀔 때 saved ID 전부의 현재 공개 상태를 다시 resolve한다. `missing IDs만 fetch`는 폐기한다. 반환되지 않은 ID는 기존 doc cache에서도 제거한다. Favorite 관계는 Auth hook에서 그대로 보존한다.
- 관리 저장/삭제/복원/등록 성공 후 관련 hero/search/favorite/document/selected/modal 상태를 invalidate한다. 관리자 route에서 공개 route로 돌아오면 새 query를 실행한다. 기존 `setSelectedPlace` 직접 호출 경로도 숨김 캐시를 되살리지 않도록 점검한다.
- 비동기 응답에는 request generation을 붙여 이전 상세/다른 계정/이전 filter 응답이 현재 화면에 들어오지 않게 한다.
- 다른 탭/다른 관리자 변경은 `firebase/firestore/lite`의 현재 구조로 실시간 push를 받지 못한다. 재진입, focus/visibility 복귀, 명시 refresh, 상세 열기, 찜 열기를 서버 재검증 지점으로 한다. 검증 중에는 stale 상세/찜을 숨긴다. 영구 offline 화면을 최신 상태로 표시하지 않는다.
- 이미 다른 브라우저가 받은 화면의 픽셀을 원격으로 즉시 회수하는 보장은 제공하지 않는다. **다음 서버 조회에서는 Rules로 차단되고 위 재검증 경로에서 화면에서도 제거**된다. 모든 열린 화면의 실시간 제거가 요구된다면 listener 전환 등 별도 설계가 필요하다. 이번 Lite/Query-first 구조의 한계를 완료 보고에서 숨기지 않는다.
- Header의 찜 수는 기존 Favorite 관계 수일 수 있다. 숨겨진 Place 표시 수와 달라져도 관계를 임의 삭제해 숫자를 맞추지 않는다. Drawer에는 필요한 경우 이용 가능한 목록 수를 따로 표시한다.

## 10. Firestore Rules 최소 확장 설계

### 10.1 권한과 read 경계

`admins/{uid}`의 `role=='admin' && active==true` 계약을 유지한다. client admins write/list 금지, 자기 문서 get만 허용한다. 일반 로그인·비로그인·비활성·다른 role은 모두 Create/Update/Hide/Restore를 거부한다. **Place/Source 물리 delete는 관리자도 거부**한다. favorites owner-only 및 2개 필드 계약은 변경하지 않는다.

Place get/list는 active admin 또는 `resource.data.publicationStatus in ['DRAFT','PUBLISHED']`일 때만 허용한다. public query에는 이 조건을 넣고 관리자 화면만 숨김 문서를 읽는다.

Source public get은 canonical nested path, Source의 placeId/path 일치, 지원 Source 종류, **부모 Place의 정상 publicationStatus**를 확인한다. Source list는 현재 public UI에 필요 없으므로 admin으로 제한한다. 부모가 HIDDEN이면 Source로 원문을 우회 조회할 수 없어야 한다.

**현재 `match /{path=**}/sources/{sourceId}`의 KTO public read도 동시에 제거/차단해야 한다.** Firestore의 여러 allow는 하나라도 허용하면 통과하므로 nested rule만 강화하면 기존 collectionGroup 규칙을 통해 KTO HIDDEN Source가 계속 읽힌다. 현재 Query-first 화면은 collectionGroup read를 쓰지 않는다. legacy 전체 loader의 권한을 복구하지 말고 관련 Emulator 기대를 public group deny로 교체한다. 기존 KTO 정상 장소 상세는 canonical Source get으로 유지한다.

### 10.2 Place + OWNER_INPUT Source create

Place create는 `isActiveAdmin() && validOwnerPlaceCreate(placeId)`로만 허용한다. 다음을 검사한다.

- owner UUID path, data.placeId 동일, Source ID가 같은 UUID에서 파생됐는지.
- 허용한 기존 Place root 키만 존재, 필수 키 존재, state=PUBLISHED, createdAt=updatedAt=request.time. 관계/extraAttributes는 초기 null 또는 부재로 제한하고 임의 map/UID 필드 추가를 차단한다.
- 필수 name/region/category와 선택 표시값 타입·길이·좌표 쌍, petPolicy/amenities/override/audit 형태. create가 단순 `keys().hasAll()`만으로 추가 비밀/관리자 키를 허용하면 안 된다.
- `getAfter(sourcePath)`의 OWNER_INPUT envelope, ID 연결, timestamp, UNVERIFIED/null, 그리고 이 source가 이전에는 없었음을 확인한다.
- search의 version/scoreVersion/키/타입/범위/합/정렬키/지역·유형 일치, primarySourceId 동일, derivedAt=request.time, hash 형태를 검증한다. KTO-only basis/OVERLAY를 owner create에서 거부한다.

Source create는 같은 active admin에게만 열고, 4.2의 10개 키와 정확한 값/타입을 검증한다. `!exists(parent)`와 `getAfter(parent)`의 owner ID, createdAt=request.time, primarySourceId 연결을 요구한다. 따라서 부모 없는 Source, 기존 Place 아래 새 Source, KTO path 아래 OWNER_INPUT, 다른 Place Source 연결, Source만 생성은 거부한다. Place만 생성도 반대편 검증으로 거부한다. Source update/delete는 두 종류 모두 false다.

상호 참조 검증은 저장 후 상태를 commit 전에 보는 `getAfter()`를 사용한다. 2개 create의 lookup/표현식 비용도 실제 두 문서 transaction으로 검증해야 한다. [getAfter 원자성 검증](https://firebase.google.com/docs/firestore/manage-data/transactions#data_validation_for_atomic_operations).

### 10.3 Update 경로 분리

권장 분기는 다음과 같다. 실제 구현 시 data/oldData/affected를 한 번 바인딩한다.

```text
active admin AND
  (publicationStatus가 변경되면 validPublicationTransition
   그렇지 않으면 기존 validDisplayUpdate)
```

- **상태 fast path**: affected keys가 정확히 `publicationStatus`, `manualAdmin`, `updatedAt`. 기존/신규 placeId 동일. 3절 전이·previous 값·audit·서버 시각만 검사한다. search/표시값/Source가 변하면 거부한다. 기존 비싼 all-field/validSearch를 다시 호출하지 않는다.
- **일반 편집**: publicationStatus 불변. 기존 partial/complete 검증 및 pet provenance 유지. HIDDEN에서 previous 값의 생성/변경/삭제를 금지한다. audit의 허용 키는 기본 6개 또는 유효한 previous가 있는 7개로 한정한다. source/UID 추가를 막는다.
- 현재 53/54-field fast path와 `manualAdmin.size()==6` 두 곳, 누적 managed 목록 검증을 함께 수정해야 한다. 특히 `validCompleteManualAdmin`의 **54-field 분기는 현재 managedFields==changedFields를 요구**한다. 상태 변경 이력의 publicationStatus가 누적 managed에 남으면 이 등식이 깨지므로 이 분기도 기존 managed와 이번 changed의 union을 보존하게 바꾼다. status 관리 이력 뒤 all-edit/clear가 실패하거나 previous가 유실되면 안 된다.
- 일반 편집 경로가 publicationStatus를 rootEditable에 단순 추가하는 방식은 금지한다. direct DRAFT↔PUBLISHED, 잘못된 복원, 상태+다른 field 혼합 저장을 막아야 한다.

### 10.4 1,000 expressions와 파생값 신뢰 경계

STATE에 기록된 기존 문제는 실제 live-sized all-edit/누적 clear에서 표현식이 1,000개를 넘은 것이다. 새 기능도 sparse/minimal, full-create, 최대 display edit, 최대 누적 managed/cleared, hidden edit, 5문서 상태 transaction을 각각 Emulator로 확인한다. 상호 create와 status path를 기존 validPlaceUpdate 뒤에 OR로 덧붙여 항상 무거운 검증을 먼저 수행하지 않는다.

**기존 Rules가 보장하지 않는 것도 명시한다.** `validSearch`/`validCompleteSearch`는 점수 범위·합·정렬 산식과 hash 64자리 형태를 검사하지만, 문서 입력으로 SHA-256 및 모든 정규화 점수를 재계산하지 않는다. 현재 파일에도 그 한계가 주석으로 적혀 있다. 따라서 UI에서 search를 숨기고 parity test를 통과했다고 해서 **권한 있는 악성 admin의 산술적으로 일관된 score/hash 위조까지 서버에서 차단된다**고 보고하면 안 된다.

이번 최소 확장의 보안 기준은 기존 admin 신뢰 경계를 유지하고 강화 가능한 연결/전이/단독 search patch/타입·산술/field allowlist를 검증하는 것이다. 일반 사용자의 모든 search write는 거부하며 status path에서는 search 전체가 불변이다. create/update 정상 payload는 자동 derivation만 사용한다. Geni는 Owner의 "내부 검색값 임의 위조 금지"가 **악성 active admin의 정합적인 파생값까지 서버 검증**을 뜻하는지 이 기존 한계와 대조해야 한다. 그 강한 의미가 필수라면 trusted backend에서 derivation을 수행하는 추가 설계가 필요하며, 현재 client+Rules 안으로 해결됐다고 승인하면 안 된다. 이 문서는 backend/Billing을 임의 추가하지 않는다.

## 11. 테스트와 검증 계획

아래는 **Tody 구현 후 Annie가 독립 실행할 Acceptance**다. 이번 Hank 설계 세션에서 새 기능 테스트를 실행하거나 PASS 판정한 내용이 아니다.

### 11.1 Unit / Python parity

- KTO 기존 ID와 owner UUID 허용, 다른 prefix/path/잘못된 UUID 거부, Place/Source 연결 불일치 거부, 재시도 시 같은 ID 유지.
- 최소 OWNER_INPUT와 모든 선택 필드가 있는 OWNER_INPUT의 Create plan; required validation; null/UNKNOWN/false/0 구분; uid/email 키 미포함.
- adapter의 OWNER_INPUT 목록/상세/이미지 placeholder/지도 좌표/Pet label/명시 clear. KTO fixture 결과 불변.
- TS/Python: 기존 KTO overlay/unknown/admin-confirmed 및 새 OWNER_INPUT unknown/admin-confirmed hash·score 완전 일치. SOURCE enum 오류, OWNER_INPUT에 KTO_OVERLAY, 잘못된 JOIN 거부. state만 바뀌어도 hash/score가 불변.
- DRAFT→HIDDEN→DRAFT, PUBLISHED→HIDDEN→PUBLISHED, 재삭제·중복 삭제·중복 복원, legacy no-audit, previous 누락/잘못된 값, 숨김 중 edit→restore. Source/서비스값/search/Favorite 불변.
- 선택 상태/필터 변경/request race/동명 장소/전체 페이지 선택. 0, 1, 5, 6, 12 초과, 100 초과, **500 초과** 선택 분할을 fake transport로 검증한다.
- chunk 성공/실패/권한 상실/응답 유실/재조회 실패/충돌 결과의 합=N, 재시도에서 성공 건 중복 처리 방지.

### 11.2 Firestore Emulator

실제 app builder로 만든 payload를 사용하고 demo project + localhost에만 seed/write한다. 기존 fixture 일부에 publicationStatus가 없는 점을 보완하되, missing-state 거부 fixture도 별도로 유지한다.

- active admin의 두 문서 create 성공. Place 단독/Source 단독/다른 UUID 연결/기존 부모에 추가/기존 Source overwrite/관리자 식별자 추가/잘못된 verificationStatus/권한 없는 source 종류 모두 거부.
- guest, normal, inactive, wrong-role의 create/edit/hide/restore 거부. admin 문서 self-promotion 거부. 모든 client Place/Source physical delete 거부.
- KTO Source create/update/delete와 OWNER_INPUT update/delete 거부. 정상 KTO 편집은 성공하며 Source byte/구조 불변.
- DRAFT/PUBLISHED 각각 hide/restore 허용, previous 값 위조/누락/상태+display 혼합/불필요한 search 변경 거부. HIDDEN 일반 편집 때 previous 보존 확인.
- public hero/region/favorite-ID/detail query는 정상 상태만 반환. HIDDEN 직접 get 및 canonical Source get 거부. active admin get/HIDDEN list는 허용. 무제약 public Catalog, recursive Source/collectionGroup 우회는 거부.
- Favorite HIDDEN 포함 기존 관계 보존, 본인 favorite create/delete 및 타인 접근 거부. 일반 정상 Place는 기존처럼 public read 가능.
- 기존 **7-field, 모든 53/54-field edit, mixed edit/clear, 전체 root clear, phone→image→image→instagram 누적 clear** 회귀 유지. 이것들을 hide/restore 이력 후에도 반복해 audit 확장으로 expression 한도가 다시 터지지 않는지 검사한다.
- 전체 선택 다섯 문서의 최대 audit 상태 transaction과 all-field Create+Source transaction을 실제 Rules 경로로 검증한다. 단일 update PASS를 bulk PASS로 대신하지 않는다. 충돌 하나가 있는 chunk, SDK 재시도, 두 관리자 동시 상태 변경도 검사한다.
- 구조적 search 위조는 거부 테스트를 한다. 10.4의 정확한 hash/score 서버 검증 한계를 별도 기록하고 fake hash fixture 통과를 암호학적 검증 PASS라고 표현하지 않는다.

### 11.3 UI / E2E

- 로컬/Emulator에서 Google-provider 또는 기존 테스트 Auth 연결 방식으로 active admin 진입. 신규 등록→지역 검색→카드/목록/지도→상세→찜→새로고침 지속성.
- DRAFT와 PUBLISHED, KTO와 OWNER_INPUT이 섞인 목록을 선택하여 hide. 정상 화면/hero/map/list/detail/favorites에서 제외되고 관리자 HIDDEN 목록에는 남는다.
- 단일·다중 restore가 각각 원래 상태로 돌아가고 기존 Favorite 관계가 다시 표시된다. Source와 Favorite 문서 수/값 보존.
- **4×8=32조합**을 normal admin / hidden admin / public 검색으로 검증한다. 빈 결과도 정상 처리하고 12개 초과/페이지 경계/동명 tie-break를 포함한다.
- 두 탭/두 관리자 edit·hide 경쟁, 조회 중 필터 전환, 상세 열린 뒤 hide 후 focus 재검증, favorite 캐시 후 hide→restore, 관리자에서 public route 복귀를 검증한다.
- 네트워크/권한/중간 chunk 실패를 주입하고 성공·실패·미확인·미시도 수와 실제 DB를 대조한다. 실패를 전체 성공으로 표시하지 않는다.
- 기존 로그인/로그아웃/찜 소유자 분리, KTO 검색·대표 추천·정렬·상세·clear 동작, Firebase `/`와 Pages `/DANGJEJU_2/` asset/base를 회귀 확인한다. 운영 Place로 destructive E2E하지 않는다.

### 11.4 실행과 결과 기록

- `npm.cmd run lint`, `npm.cmd run build`, Pages base build, `node --import tsx --test tests/*.test.ts tests/*.test.mjs`에 해당하는 실제 Windows 파일 확장 목록 실행.
- `python -m unittest discover -s tools/firestore_place_search_fields -p 'test_*.py'` 및 기존 pilot/full import offline 회귀. import apply/운영 write 명령은 실행하지 않는다.
- `tests/firestoreRules.test.ts`는 Emulator 환경이 없으면 SKIP하므로 SKIP을 PASS로 합산하지 않는다. demo Emulator 실행 명령/host/project/exit code와 tests/pass/fail/skip을 기록한다.
- 새 composite index의 production READY/실제 query 검증은 운영 승인 후 별도 확인한다. local/emulator 결과와 분리해 보고한다.
- `git diff --check`, 비밀/UID/raw 혼입 점검, 변경 파일·함수·이유·회귀 영향을 `TODY_PLACE_CRUD_IMPLEMENTATION_20261001.md`에 적는다. Annie의 실제 실행 모델과 독립 결과는 `ANY_PLACE_CRUD_VERIFICATION_20261001.md`에 적는다.

## 12. Tody 구현 체크리스트와 Geni 인계

### 12.1 구현 순서

- [ ] 최신 원격·Owner/Geni 문서 재확인. 이 설계의 운영 분포 미확인을 해소하거나 미해소 상태를 명시한다. Geni 설계 검토 후 구현한다.
- [ ] 공통 ID/상태 타입·validator, 생성 Source envelope, state transition builder를 정의한다. 기존 enum을 중복 발명하지 않는다.
- [ ] TS/Python OWNER_INPUT derivation 및 adapter/loader 일반화. 기존 KTO hash parity부터 보존한다.
- [ ] Create plan과 두 문서 원자 생성, strict create Rules, 정상/공격 fixture를 구현한다.
- [ ] previous 상태를 포함한 상태 전용 transaction/Rules를 구현하고 일반 edit의 audit 보존을 보완한다.
- [ ] 관리자 region/category/status pagination 및 전체 조건 선택, 5개 transaction chunk와 결과 분류를 연결한다.
- [ ] public 상태 query, 신규 index 3개, 공개/관리자 loader 분리, parent 기반 Source read와 recursive allow 차단을 같이 구현한다.
- [ ] 상세 선검증, Favorite 재조회, query/cache/선택 무효화, 응답 race 방지를 적용한다.
- [ ] 최소/최대 create, all-edit/clear, bulk/동시성, 32조합, 기존 회귀를 실행한다. expression/lookup 한도 검증 결과로 chunk 상수를 확정한다.
- [ ] 구현 보고서를 작성하고 Geni에게 넘긴다. Annie는 구현자와 분리하여 실제 검증한다. FAIL은 설계/구현 원인에 맞게 되돌린다.

### 12.2 Geni가 검토할 결정과 미확인 항목

설계 검토 지점은 (1) DRAFT/PUBLISHED 공개 호환 정책, (2) `manualAdmin.previousPublicationStatus` 한 항목의 최소 확장, (3) 신규 PUBLISHED + UNVERIFIED Source 구분, (4) 5개 transaction chunk와 부분 결과, (5) 공개 Source 우회 read 차단, (6) 기존 client derivation의 서버 검증 한계다. 정확한 분포 미확인은 2절 절차로 채우며 Owner에게 기술 선택 하나마다 재승인을 요청할 필요는 없다.

이번 단계 완료 사실은 **로컬 설계 문서 작성**이다. 구현 PASS, Annie 검증 PASS, 운영 적용, Owner 최종 수락으로 바꿔 적지 않는다. `STATE.md`는 현재 9월 snapshot이므로 현재 단일 담당인 Geni가 최신 CRUD 단계와 이 문서 링크를 반영하도록 인계한다. Hank가 기존 담당 상태를 임의로 덮어쓰지 않았다.

### 12.3 GitHub 전달과 배포 경계

이번 환경에서는 `.git` 쓰기와 원격 연결이 실패하여 **commit/push하지 못했다**. 이 파일은 로컬에서 읽을 수 있으며 원격 전달 완료는 아니다. 기존 untracked `.cursor/`, `.playwright-mcp/`, `NUL`, `scratch/`, `tools/kto_data_probe/`는 보존한다.

추가로 `.github/workflows/main.yml`은 `feature/firestore-place-ui`의 **모든 push**에 Pages 배포를 연결하고 path 제외가 없다. Owner는 branch commit/push를 허용했지만 이번 운영 Pages 배포는 승인하지 않았다. 따라서 Geni는 문서 인계 push가 자동 운영 배포를 일으키지 않도록 검토된 CI skip 방식 등 허용된 게시 절차를 적용하고 실제 workflow 결과를 확인해야 한다. 앱/Rules/index 운영 배포, 새 billing, upstream main/PR merge는 별도 범위다. 이 세션에서는 workflow를 수정하거나 배포를 트리거하지 않았다.

다음 행동: **Geni가 이 문서를 검토하고 2절의 읽기 전용 분포 확인 및 10.4의 보안 계약 해석을 마무리한 뒤, 승인된 설계를 Tody에게 전달한다.**
