# BRIEF — 조건 검색 전환 (전체 Catalog 선로딩 폐기)

**Branch:** `feature/firestore-place-ui`  
**상태:** 구현 계획 (Owner/Toby 승인 대기). **코드·DB·Hosting·PR·main merge 미실행.**  
**작성:** Geni. Architecture/Query 1차 검토: Hank (`gpt-6-astra` / `xhigh`).  
**근거:** Owner/Toby 확정 방향 + `reports/firestore_*` 조사 + Hank `private_probe/firestore_search_brief/HANK_SEARCH_ARCHITECTURE_REVIEW.md`.

---

## 0. 목표 / 비목표

### 목표
- 사이트 접속 시 Firestore **전체 Place+Source(~4,252 reads)** 선로딩을 폐기한다.
- 사용자가 고른 **지역 × 장소종류**에 맞는 Place만 조회한다.
- 검색 결과는 **조건에 맞는 전부**를 목록·지도에 동일하게 쓴다 (임의 20~30 분할 없음).
- 반려동물 정보 **미확인 장소도 결과에 포함**하되, 정보 풍부도 순으로 정렬하고 미확인을 명확히 표시한다.
- 첫 화면은 전체 2,126을 읽지 않고, **정보점수 ≥ 12** 대표 후보만 소수 노출한다 (placeId 하드코딩 금지).
- Favorites도 전체 Catalog 없이 **찜 placeId만** 해석한다.

### 비목표 (이번 구현 범위 밖)
- 결제·광고·프로모션 시스템
- KTO Source 원문 덮어쓰기 / Place 재Import / Full Import 재실행
- 검색어 자유 입력
- Security Rules를 추측으로 넓히기
- 결과 페이지네이션 (현 단계)

---

## 1. 변경 Architecture

```text
[현재]
App mount → getDocs(places 전체) + Source batch(~2126)
         → Browser에서 region/category 필터·이름 정렬
         → Favorites = catalog ∩ savedIds

[변경]
Home        → query(totalScore >= 12) limit(HERO_LIMIT)   // Place only
Search      → query(region==X AND category==Y) orderBy(petSortKey DESC)  // Place only, 전체 N
Detail open → getDoc(places/{id}/sources/{primarySourceId})  // 1 Source
Favorites   → list favorites IDs → getDoc(places/{id}) for misses only
```

핵심 원칙:
1. **목록·지도·hero·찜 카드는 Place(+검색용 파생/`listView`)만** 사용. 목록에서 Source read = 0.
2. **상세 모달에서만** 해당 Place의 primary Source 1건을 읽는다.
3. Browser adapter의 지역/종류 **재계산으로 검색하지 않는다**. Firestore에 저장된 파생 필드로 query한다.
4. KTO 원본(`sources/.../kto.*`, Place의 원천 관측 필드)과 서비스 파생(`search.*`)을 분리한다.

---

## 2. Firestore에 추가/변경할 필드

기존 `places/{placeId}`에 **map 2개만 추가(update)**. placeId·Source·favorites·기존 petPolicy/amenities 원본은 유지.

### 2.1 `search` (쿼리·정렬용)

| 필드 | 타입 / 값 | 설명 |
|---|---|---|
| `search.version` | `1` | 계약 버전. query에 `== 1` 포함 |
| `search.region` | `JEJU_CITY \| SEOGWIPO_CITY \| EAST \| WEST \| UNKNOWN` | 검색 지역 |
| `search.category` | `ATTRACTION \| CAFE \| FOOD \| SHOPPING \| STAY \| LEISURE \| CULTURE \| EVENT \| UNKNOWN` | 검색 종류 |
| `search.regionBasis` | `ADDRESS_EAST \| ADDRESS_WEST \| MUNICIPALITY \| UNKNOWN` | 파생 근거 |
| `search.categoryBasis` | `KTO_CONTENT_TYPE \| KTO_CAT3 \| TITLE_FALLBACK \| UNKNOWN` | 파생 근거 |
| `search.basicScore` | 0..15 | audit V1 기본 정보 점수 |
| `search.petScore` | 0..9 | audit V1 반려 원문 점수 |
| `search.totalScore` | 0..24 | basic+pet |
| `search.scoreVersion` | `"hank-place-field-audit-v1"` | 점수 정의 버전 |
| `search.petTier` | `RICH \| PARTIAL \| BASIC \| UNKNOWN` | 표시/정렬 단계 |
| `search.petSortKey` | int | 단일 `orderBy`용 (아래 §5) |
| `search.primarySourceId` | string | 상세용 Source 문서 ID |
| `search.inputHash` | string | idempotent migration용 |
| `search.derivedAt` | timestamp | 파생값 실변경 시각 |

**덮어쓰지 않음:** `sources/*/kto.*`, `municipality`, `regionArea`, `serviceCategory`(기존 null 자리), Place 원천 name/address/phone/images 등.

### 2.2 `listView` (목록 표시 사본)

Source join 없이 Card/List/Map preview용. 최소:
`name`, `address`, `roadAddress`, `regionName`, `shortDesc`, `coordinates` (`{lat,lng}|null`), `imageFallbackUrls`.

표시 fallback 문구는 **점수 입력에 다시 넣지 않는다**.

### 2.3 수익화 여지 (필드만 예약, 미구현)

향후 `promotion` map (예: `slot`, `priority`, `expiresAt`)을 hero와 분리 가능하도록 BRIEF에만 기록. **이번 단계 구현·결제 없음.**

---

## 3. 지역 / 종류 값 생성 규칙

### 3.1 지역 (`search.region`) — 현행 `regionFor`와 동일 상호배타

입력 주소: `trim(Place.address) || trim(kto.addr1)` (**roadAddress로 대체하지 않음**).

1. `/구좌|조천|성산|표선/` → `EAST` / 표시 `동부 (매칭어)`
2. else `/애월|한림|한경|안덕|대정/` → `WEST` / `서부 (매칭어)`
3. else `municipality=JEJU_CITY` → `JEJU_CITY` / `제주시`
4. else `municipality=SEOGWIPO_CITY` → `SEOGWIPO_CITY` / `서귀포시`
5. else `UNKNOWN` (검색 버튼 대상 아님; 현재 스냅샷 0건 기대)

**의미:** 제주시/서귀포시 버튼은 행정시 전체가 아니라, 동·서부 휴리스틱에 먼저 안 걸린 나머지 권역이다. (현행 UI와 동일)

### 3.2 장소 종류 (`search.category`) — Owner 8종

| UI 라벨 | `search.category` | 규칙 |
|---|---|---|
| 관광지 | `ATTRACTION` | KTO `contentTypeId=12` |
| 문화시설 | `CULTURE` | `14` |
| 축제·공연·행사 | `EVENT` | `15` |
| 레포츠 | `LEISURE` | `28` (산책로로 재해석하지 않음) |
| 숙박 | `STAY` | `32` |
| 쇼핑 | `SHOPPING` | `38` (이름에 카페 있어도 쇼핑) |
| 카페 | `CAFE` | `39` + `cat3===A05020900` 또는 cat3 공란일 때 title 카페 정규식 |
| 음식점 | `FOOD` | `39` 중 카페가 아닌 나머지 |

`39` 분기는 현행 `categoryFor`와 동일.  
기존 UI `spot`은 12/14/15/28/38을 합친 값이었음 → **검색 8종으로 세분화** (의도적 변경).

UI 선택: 자유 검색어 없음. 지역 4 + 종류 8 **버튼만**.

---

## 4. 첫 화면 대표 장소

### 선정 (하드코딩 ID 금지)
```text
where search.version == 1
where search.totalScore >= 12
orderBy search.totalScore DESC
limit HERO_LIMIT   // 권고 5. 후보 집합이 아님
```

- 현재 조사: ≥12점 **5곳** (카페에벤에셀 14, 아우아우 13, 생각하는 정원/광치기해변/송악산둘레길 12).
- 운영자가 Place/Source 유효 정보를 보강 → 점수 재계산 → 다음 cache 갱신에 **자동 후보**.
- 이미지 없는 후보도 제외하지 않음 (placeholder 허용).
- 후보 0건이어도 **전체 catalog fallback 금지**.

### 수익화
대표 영역은 향후 업체 노출 슬롯으로 확장 가능하나, 이번엔 **미구현**. hero는 정보점수 기반만.

---

## 5. 검색 Query / 반려 정렬

### Query
```text
where search.version == 1
where search.region == <선택>
where search.category == <선택>
orderBy search.petSortKey DESC
# limit / startAfter / 임의 slice 없음 → 결과 전체
```

- 지역·종류 **둘 다 선택되기 전**에는 search query를 보내지 않는다 (home = hero만).
- `publicationStatus`, 사진 유무, pet 상태로 **추가 필터하지 않음** (DRAFT·UNKNOWN 모두 포함).

### Pet 단계 (제안 경계 — Owner 승인 대상)
| Tier | 조건 | 의미 |
|---|---|---|
| `RICH` | overlay & petScore 5..9 | 반려 정보 풍부 |
| `PARTIAL` | overlay & petScore 2..4 | 일부 |
| `BASIC` | overlay & petScore 0..1 | 기본 확인(상태만/최소) |
| `UNKNOWN` | `petInformationStatus=UNKNOWN` | 미확인 (불가 아님) |

```text
tierRank: RICH=3, PARTIAL=2, BASIC=1, UNKNOWN=0
petSortKey = tierRank*10000 + petScore*100 + basicScore
```

정렬: `petSortKey DESC` → 풍부 → 일부 → 기본확인 → 미확인.  
미확인도 결과에 포함. 동점은 Firestore document path 기본 순서.

점수 정의는 audit V1 (`hank-place-field-audit-v1`)과 동일 계약. 팀장 입력으로 해당 필드가 채워지면 점수↑.

---

## 6. 정보 확인 / 미확인 표시

- **유지:** 기존 `PET_KNOWN_LABEL` / `PET_UNKNOWN_LABEL` / `PET_UNKNOWN_NOTICE` 의미  
  (“미확인 ≠ 동반 불가”, 방문 전 업체 확인 안내).
- 목록: 확인/미확인 **배지·섹션 구분** (가능하면 두 그룹 헤더 또는 sticky divider).
- 상세: 기존 notice + petDetails 유지 (Source 로드 후).
- RICH/PARTIAL은 “정보가 많다”이지 출입 허가·추천 품질이 아님.

---

## 7. 지도 표시

- 목록과 **동일 `resultPlaces` 배열**을 입력으로 사용.
- marker 색/아이콘으로 **확인 vs 미확인** 구분 검토 (예: 확인=본색, 미확인=중립 회색 아웃라인).
- 좌표 이상 1건: 목록·건수에는 유지, marker만 생략 + 기존 “좌표 확인 필요 N곳” 안내 유지.
- 지도 pan/zoom/마커 선택으로 **추가 Firestore read 금지**.

---

## 8. Favorites 조회

1. 기존대로 `users/{uid}/favorites` 목록만 읽기 (Auth/session 유지).
2. Drawer 오픈 시: 메모리 cache에 없는 placeId만 `getDoc(places/{id})` (동시성 제한, in-flight 공유).
3. 검색 조건과 교집합하지 않음 → **검색 밖 찜도 표시**.
4. 레거시 `place-*` ID는 변환/삭제하지 않고 unresolved로 분리.
5. 상세에서만 Source 추가 로드 (필요 시).
6. 찜 추가/삭제마다 전체 재조회하지 않음.

---

## 9. 필요한 Firestore Index

신규 composite (기존 `sources` CG index는 유지):

1. `places`: `search.version ASC`, `search.region ASC`, `search.category ASC`, `search.petSortKey DESC`
2. `places`: `search.version ASC`, `search.totalScore DESC` (hero; inequality+orderBy 동일 필드)

선택: `listView` map 단일필드 인덱스 exemption.  
앱 cutover는 **index READY 확인 후**.

Rules: 현행 public Place/Source read + favorites owner-only 유지. **read 권한 확대 불필요.**  
(참고: public read는 타 클라이언트의 전체 조회를 막지 못함 — 앱 정상 경로 비용 절감이 1차 목표.)

---

## 10. 기존 UI 유지 / 변경

### 유지
Header, Google 로그인/로그아웃, PlaceCard/ListItem 레이아웃, Detail Modal 골격, JejuMap 골격, SavedPlacesDrawer, EventBanner, 찜 하트 UX.

### 변경 (최소 연결)
- 지역: `all` 제거 또는 “미선택”으로 재해석 — **전체 query 의미 금지**.
- 종류: `trail`/`spot` 중심 → Owner **8종** 버튼·배지 사전.
- Home: hero 영역 (catalog 전체 그리드 대체).
- 검색: 두 조건 선택 후 결과 로드; 목록=지도 공유 상태.
- Catalog 전역 hook 제거 → `usePlaceSearch` / `useHeroPlaces` / favorites place resolve.
- Drawer loading을 catalog status에 묶지 않음.

---

## 11. Migration

1. 오프라인 dry-run: 스냅샷/해시·1:1 Place-Source·점수·32조합 검증.
2. 공유 파생 generator (backfill = 향후 import/운영 수정과 동일 계약).
3. Quota 회복 후 live fingerprint 확보 → **좁은 update** (`search`/`listView`만). set 전체 덮어쓰기·삭제 금지.
4. Batch(~200) + checkpoint + quota 시 **즉시 중단·재시도 폭주 금지**.
5. `inputHash` 동일 → write 0 (idempotent).
6. 전건 `search.version=1` 검증 후 앱 cutover.
7. Favorites·Source·원본 Place 필드 보존 검증.
8. Rollback: 새 query 경로 feature flag OFF. **자동 전체 catalog 재로딩으로 되돌리지 않음.**

쓰기 예산(전건 최초): ~2,126 Place updates.  
운영 검증 read는 별도 예산(승인된 창에서 1회성).

---

## 12. Test 방법

- Unit: region/category 규칙, score/tier/petSortKey, listView 생성, adapter 회귀(KTO 의미 보존).
- Query mock: hero 5 docs / 예: 동부×카페 39 docs / Source list=0 / detail Source=1 / reopen=0.
- Favorites: cache hit/miss, 레거시 ID, 부분 실패, A→B 계정 전환.
- Rules emulator: guest place read, client write deny, favorites owner-only.
- Index: production READY + 실제 SDK smoke (emulator만으로 READY 단정 금지).
- 429 주입: 자동 retry 0, DB 단위 cooldown, 버튼/홈으로 우회 불가.
- CI: lint/build + 기존 favorites/adapter tests.

---

## 13. 429 재발 방지 검증

| 통제 | 내용 |
|---|---|
| 경로 | 전체 places/getAll sources 코드 경로 삭제·테스트로 금지 |
| Cache | 조건별 memory/session TTL + in-flight coalesce; 구 catalog cache 폐기 |
| Breaker | `RESOURCE_EXHAUSTED`/429 시 **자동 retry 0**, DB 단위 cooldown ≥60s, 수동 1회만 |
| Prefetch | 32조합 선로딩·지도 이동 fetch 금지 |
| Fallback | quota/index/permission 실패 시 전체 catalog로 우회 **금지** |
| Live | quota 회복 후 **합의된 소규모 smoke 1회**만; audit용 전체 재스캔 금지 |

---

## 14. 예상 Firestore read 비교 (성공 경로 추정)

| 시나리오 | 현재(대략) | 변경 후(대략) |
|---|---|---|
| Guest cold home | ~4,252 | hero **5** Place |
| Home + 동부×카페 | (이미 cold에 포함) | 5 + **39** = 44 |
| Home + 최대조합(제주시×쇼핑) | ~4,252 | 5 + **258** = 263 |
| 상세 첫 열기 | (이미 Source 보유) | **+1** Source |
| 찜 F=10, miss 10 | catalog 의존 | favorites list + **≤10** Place |

상대 감소: cold home **~99.9%**, 대표 검색 **~94–99%**.  
※ 청구 실측치는 cutover 후 소규모 live smoke로 확인.

---

## 15. 변경 파일 예상 목록

**앱**
- `src/lib/placesCatalog.ts`, `placesCatalogCache.ts` → 검색/hero/detail loader로 재구성 또는 대체
- `src/lib/placeAdapter.ts`, `src/types.ts`, `src/data/places.ts` (8종·region enum)
- `src/hooks/usePlacesCatalog.ts` → `useHeroPlaces` / `usePlaceSearch` 등
- `src/App.tsx`, Card/List/Map/Modal/Drawer (배지·그룹·loading 연결)
- `src/lib/favorites.ts` / session (catalog 교집합 제거)

**데이터/도구**
- `tools/firestore_place_*` : search/listView backfill (idempotent)
- `firestore.indexes.json`, (필요 시 rules 주석만; 권한 확대 없음)
- `tests/*` 검색·점수·favorites resolve·429 breaker

**문서**
- 본 `BRIEF.md`, Hank review (private_probe), reports는 근거 유지

---

## 16. 구현 순서 (승인 후)

1. 공유 파생 generator + unit tests (region/category/score/listView)  
2. Offline dry-run / migration 도구  
3. Indexes 배포 → READY  
4. Live backfill (quota 창, checkpoint) + 전건 검증  
5. App 읽기 경로 cutover (hero → search → detail Source → favorites resolve)  
6. UI 8종·확인/미확인 구분·지도 마커  
7. 429 breaker + cache  
8. Ani 독립 검토 → Hosting (Owner 별도 승인) → **PR/main은 Owner 지시 시에만**

---

## 17. Agent 역할 계획

| 역할 | 담당 |
|---|---|
| **Geni** | BRIEF 통합, 구현 orchestration, cutover 책임, Owner 보고 |
| **Hank (gpt-6-astra / xhigh)** | Query/index/migration/점수 정렬 구현·검증 (승인 후) |
| **Ani (gemini-3.1-pro-high)** | 독립 검토: 원본 비파괴, 429 경로 부재, favorites 분리, UI 의미(미확인≠불가) |

---

## 18. Owner / Toby 승인 요청 사항

확정 방향(1–9)은 재승인 불필요. 아래 **세부값**만 BRIEF에서 확정해 주시면 구현 착수:

1. Pet tier 경계: RICH≥5 / PARTIAL 2–4 / BASIC 0–1 제안 — 수용 여부  
2. Hero `HERO_LIMIT=5`, 임계 `totalScore≥12` — 수용 여부  
3. 검색은 **지역+종류 둘 다 필수** (한 조건만 검색 비허용) — 수용 여부  
4. 지역 버튼 의미: 현행 adapter 상호배타 휴리스틱 유지 — 수용 여부  
5. UI 8종 세분화에 따른 배지/필터 변경을 “디자인 유지” 범위로 허용 — 확인  

---

## 중단

이 BRIEF와 Hank 검토·기존 audit CSV 분석까지 완료.  
**코드 수정 / Firestore 데이터 변경 / Hosting / PR / main merge 하지 않음.**

승인 후 위 §16 순서로 구현을 시작한다.
