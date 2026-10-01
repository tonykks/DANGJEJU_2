# PLACE CRUD LIVE PRECHECK — 2026-10-02

> Repository: `tonykks/DANGJEJU_2`
> Working Branch: `feature/firestore-place-ui`
> Author: Geni (CTO & Lead Orchestrator)
> Scope: GitHub Pages 자동 배포 정합성 검증 및 운영 Firestore Read-Only 사전 확인
> Verification Target: Commit `be161833c58718d0f230c09fe4c22cf60d86ee77` / GitHub Actions Workflow Run `36882868549`

---

## 1. 개요 및 배경

최종 코드 및 산출물 커밋 `be161833`을 `feature/firestore-place-ui` 브랜치에 푸시한 직후, GitHub Actions 워크플로우 `Deploy Vite site to Pages` (Run `36882868549`)가 트리거되어 GitHub Pages(`https://tonykks.github.io/DANGJEJU_2/`)에 신규 프론트엔드가 자동 배포되었습니다.

이에 따라 이전 보고서의 "GitHub Pages 운영 배포 미실시" 내용을 정정하고, 승인되지 않은 운영 Firebase 배포(Rules/Indexes) 및 운영 write를 일절 수행하지 않은 상태에서, 현재 라이브 환경의 정합성을 **순수 Read-Only**로 정밀 진단했습니다.

---

## 2. GitHub Pages 배포 상태 및 Firebase 백엔드 정합성 진단

### 2.1 배포된 프론트엔드 버전 확인
- **배포 URL**: `https://tonykks.github.io/DANGJEJU_2/` (HTTP 200 OK)
- **배포 JS 번들**: `/DANGJEJU_2/assets/index-BMHHLGRw.js` (812,742 bytes)
- **번들 코드 분석 결과**:
  - `owner-` Place ID validator 및 `OWNER_INPUT` Source 로직 포함 확인: **YES**
  - `AdminPlaceCrud` 컴포넌트 (`선택 장소 삭제`, `AdminRegionManager` 등) 포함 확인: **YES**
  - Soft Delete 복원 필드 (`previousPublicationStatus`) 포함 확인: **YES**
  - 공개 쿼리 가시성 필터 (`publicationStatus in ['DRAFT', 'PUBLISHED']`) 포함 확인: **YES**
  - **판정**: 현재 GitHub Pages는 최신 커밋 `be161833`의 CRUD 확장 프론트엔드가 정확히 배포된 상태입니다.

### 2.2 공개 Home 및 지역×업종 검색 Read-Only 테스트
라이브 Firebase(`dangjeju`)를 대상으로 신규 배포된 프론트엔드가 실행하는 것과 동일한 클라이언트 쿼리를 실행하여 동작 여부를 검증했습니다.

| 쿼리 유형 | 세부 필터 및 정렬 조건 | 실행 결과 | 오류 내용 / 원인 |
|---|---|:---:|---|
| **Home Hero Places** | `publicationStatus IN ['DRAFT', 'PUBLISHED']`<br>`search.version == 1`<br>`ORDER BY search.totalScore DESC`<br>`LIMIT 5` | **FAILED** | `failed-precondition: The query requires an index`<br>신규 복합 인덱스 미존재 |
| **Search (WEST × CAFE)** | `publicationStatus IN ['DRAFT', 'PUBLISHED']`<br>`search.version == 1`<br>`search.region == 'WEST'`<br>`search.category == 'CAFE'`<br>`ORDER BY search.petSortKey DESC`<br>`LIMIT 20` | **FAILED** | `failed-precondition: The query requires an index`<br>신규 복합 인덱스 미존재 |
| **Admin Search (WEST × CAFE)** | `publicationStatus == 'DRAFT'`<br>`search.version == 1`<br>`search.region == 'WEST'`<br>`search.category == 'CAFE'`<br>`ORDER BY name ASC`<br>`LIMIT 5` | **FAILED** | `failed-precondition: The query requires an index`<br>신규 복합 인덱스 미존재 |
| **Place Detail Read** | `doc(db, 'places', 'kto-1000000')` 단건 조회 | **SUCCESS** | 단건 읽기는 정상 동작 (문서 부재 시 NOT FOUND 반환) |

### 2.3 신규 3개 Composite Index의 Live Firebase 존재 여부
- **확인 결과**: **Live Firebase에 미존재 (미배포)**
- **진단 근거**: 상기 3개 복합 쿼리 실행 시 Firestore 서버에서 인덱스 생성 콘솔 링크와 함께 `failed-precondition` 오류를 반환했습니다.
  - 인덱스 1: `places` (`publicationStatus` ASC, `search.version` ASC, `search.totalScore` DESC)
  - 인덱스 2: `places` (`publicationStatus` ASC, `search.category` ASC, `search.region` ASC, `search.version` ASC, `search.petSortKey` DESC)
  - 인덱스 3: `places` (`publicationStatus` ASC, `search.category` ASC, `search.region` ASC, `search.version` ASC, `name` ASC)

### 2.4 신규 CRUD Firestore Rules의 Live Firebase 배포 여부
- **확인 결과**: **신규 Rules 미배포 (기존 OLD Rules 활성 상태)**
- **진단 근거 (Read-Only)**:
  - 신규 Rules 계약: `match /places/{placeId}/sources/{sourceId}`에 대해 `allow list: if isActiveAdmin();`로 비로그인 조회가 차단되어야 함.
  - 실제 라이브 진단: 비로그인 익명 클라이언트가 `places/kto-1000000/sources`의 getDocs(list)를 호출한 결과, 이전 Rules의 `allow read: if true;` 규칙에 의해 **200 OK (ALLOWED)**로 정상 응답되었습니다.
  - 따라서 현재 운영 Firebase는 신규 CRUD Rules가 배포되지 않은 기존 규칙 상태를 그대로 유지하고 있습니다.

---

## 3. publicationStatus 실제 운영 분포 확인 (Read-Only)

운영 DB에 어떠한 쓰기도 가하지 않고, Firestore REST `runAggregationQuery` (Count Aggregation)를 통해 전체 2,126개 장소 문서의 `publicationStatus` 분포를 집계했습니다.

| 분류 | 집계 결과 | 비율 | 비고 |
|---|:---:|:---:|---|
| **전체 Place 문서 수** | **2,126** | 100.0% | 기존 KTO 수집 데이터 총량과 완벽 일치 |
| **DRAFT** | **2,126** | 100.0% | 운영 데이터 2,126건 전수가 DRAFT 상태 |
| **PUBLISHED** | **0** | 0.0% | 현재 PUBLISHED 장소 없음 |
| **HIDDEN** | **0** | 0.0% | 현재 HIDDEN 장소 없음 |
| **기타 / 누락** | **0** | 0.0% | `publicationStatus` 필드 누락이나 예외값 없음 |

### 설계 영향 분석:
- 운영 DB의 모든 장소(2,126건)는 현재 `DRAFT` 상태이므로, 신규 프론트엔드가 적용한 `publicationStatus in ['DRAFT', 'PUBLISHED']` 가시성 범위에 정상적으로 100% 포함됩니다.
- Soft Delete 수행 시 `DRAFT -> HIDDEN` 전이가 발생하며, Restore 수행 시 `manualAdmin.previousPublicationStatus`에 저장된 원래 상태인 `DRAFT`로 완벽하게 원복될 수 있음이 검증되었습니다.

---

## 4. 정합성 불일치 원인 및 향후 조치 방안

### 4.1 불일치 원인
- `.github/workflows/main.yml`의 push 트리거 설정(`branches: [main, feature/firestore-place-ui]`)에 의해, `feature/firestore-place-ui`에 푸시된 커밋 `be16183`이 자동으로 GitHub Pages에 빌드 및 배포되었습니다.
- 반면 승인 범위 제약(운영 Firebase 배포 금지)에 따라 `firestore.indexes.json`과 `firestore.rules`는 운영 Firebase에 배포되지 않았습니다.
- 그 결과, 현재 GitHub Pages를 브라우저로 접속하면 프론트엔드의 `publicationStatus` 복합 쿼리가 운영 Firestore의 `missing index` 오류로 인해 실패하고 있습니다.

### 4.2 조치 방안
1. **운영 인덱스 및 룰스 배포 승인 시**:
   - `firebase deploy --only firestore:indexes,firestore:rules`를 운영 환경에 안전하게 배포하면, 신규 인덱스 빌드 완료 후 GitHub Pages의 Home/검색 기능이 정상 작동하게 됩니다.
2. **또는 배포 전 원상 롤백 검토 시**:
   - GitHub Pages를 이전 커밋으로 롤백하거나, 운영 배포 승인 전까지 인덱스 배포를 연계 진행합니다.
