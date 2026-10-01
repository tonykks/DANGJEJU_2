# PLACE CRUD LIVE DEPLOY RESULT — 2026-10-02

> Repository: `tonykks/DANGJEJU_2`
> Working Branch: `feature/firestore-place-ui`
> Author: Geni (CTO & Lead Orchestrator)
> Project: Firebase `dangjeju`
> Final Status: **ALL PASS (Indexes READY, Rules Released, Smoke Test 100% PASS)**

---

## 1. 운영 배포 개요

`PLACE_CRUD_LIVE_PRECHECK_20261002.md` 검토 후 Toby의 승인에 따라, 신규 Place CRUD 확장을 위한 백엔드 정합성 배포(3개 복합 인덱스 및 강화된 보안 규칙)를 운영 Firebase 환경(`dangjeju`)에 안전하게 적용하고, 배포 후 Read-Only Smoke Test를 전수 수행하여 무결성을 검증했습니다.

- **작업 원칙 준수**:
  - 운영 Place / Source / Favorites 데이터에 대한 write는 0건 (100% 불변 유지).
  - Vercel, Firebase Hosting, upstream main, PR #1 변경 없음.
  - GitHub Pages는 최신 프론트엔드(`be16183`)와 백엔드 간 100% 정합성 동기화 완료.

---

## 2. Firestore Indexes 배포 및 READY 전환 결과

`firestore.indexes.json`에 정의된 3개 신규 복합 인덱스를 `dangjeju`에 배포하고, 백엔드 빌드 진행 상황을 폴링하여 3개 인덱스 모두 **READY** 상태로 전환되었음을 확인했습니다.

| 인덱스 대상 | 필드 구성 | 빌드 시작 | 최종 상태 | 비고 |
|---|---|:---:|:---:|---|
| `places` | `publicationStatus` ASC<br>`search.version` ASC<br>`search.totalScore` DESC | 00:49:16 | **READY** | Home Hero 추천 쿼리 지원 |
| `places` | `publicationStatus` ASC<br>`search.version` ASC<br>`search.region` ASC<br>`search.category` ASC<br>`search.petSortKey` DESC | 00:49:16 | **READY** | 4지역 × 8업종 사용자 검색 지원 |
| `places` | `publicationStatus` ASC<br>`search.version` ASC<br>`search.region` ASC<br>`search.category` ASC<br>`name` ASC | 00:49:16 | **READY** | 관리자 지역×업종 정렬 쿼리 지원 |

- **READY 소요 시간**: 약 5분 30초 (Attempt 29에서 3개 모두 READY 전환 완료).

---

## 3. Firestore Rules 운영 배포 결과

인덱스가 모두 READY 상태가 된 직후, 검증 완료된 `firestore.rules`를 운영 Firebase에 정식 릴리스했습니다.

- **컴파일 경고 점검**: 미사용 헬퍼 함수 경고 외 문법 및 평가 오류 없음 (컴파일 성공).
- **릴리스 완료**: `firestore: released rules firestore.rules to cloud.firestore` (00:55:37).
- **보안 계약 활성화**:
  - `match /places/{placeId}`: 관리자 CUD 허용, 1,000 expression limit 회피 fast path 활성화, 물리 삭제(`delete`) 전면 차단.
  - `match /places/{placeId}/sources/{sourceId}`: KTO 소스 write 차단, canonical 소스 외 비인가 소스 은닉.
  - `match /{path=**}/sources/{sourceId}`: collectionGroup 공개 읽기 전면 차단.
  - `match /admins/{uid}`: 관리자 권한 상승 쓰기 차단, 본인 문서만 read 허용.
  - `match /users/{uid}/favorites/{placeId}`: 소유자 외 타인 찜 목록 조회/조작 차단.

---

## 4. 배포 후 Read-Only Smoke Test 결과

라이브 환경(`dangjeju`)을 대상으로 비로그인 공개 조회, 쿼리 무결성, 보안 규칙 방어력을 검증했습니다.

| 검증 항목 | 세부 조건 | 결과 | 측정치 / 확인 내용 |
|---|---|:---:|---|
| **Home Hero Places** | `publicationStatus IN ['DRAFT', 'PUBLISHED']`<br>`search.version == 1`<br>`ORDER BY search.totalScore DESC` (limit 5) | **PASS** | 5개 장소 반환 (1위: 카페에벤에셀 18점, 2위: 생각하는 정원 18점, 3위: 아우아우 15점) |
| **WEST × CAFE 검색** | `search.region == 'WEST'`, `search.category == 'CAFE'`<br>`publicationStatus IN ['DRAFT', 'PUBLISHED']` (limit 20) | **PASS** | 20개 장소 반환 (블리스풀, 카페 어림비 등 정렬 순 정상) |
| **전체 32개 조합 쿼리** | 4개 행정 구역 × 8개 장소 유형 전체 조합 | **PASS** | **32 / 32 전원 성공 (오류 0건)** |
| **Place 상세 조회** | `getDoc(doc(db, 'places', 'kto-3112168'))` | **PASS** | 아우아우 단건 문서(DRAFT) 정상 조회 |
| **Canonical Source 조회** | `getDoc(doc(db, 'places', 'kto-3112168', 'sources', 'kto-areaBasedList2-3112168'))` | **PASS** | KTO canonical source 정상 조회 |
| **Missing Index 오류** | 전체 쿼리 실행 중 인덱스 부재 오류 | **0건 (PASS)** | 신규 배포된 인덱스 정상 반영 확인 |
| **유효 읽기 Permission 오류** | 허용된 공개 쿼리 및 상세 읽기 | **0건 (PASS)** | 프론트엔드 화면 정상 렌더링 확인 |
| **Subcollection 은닉** | 비로그인 `places/{id}/sources` collection getDocs | **PASS** | `permission-denied`로 안전하게 차단됨 |
| **일반 사용자 Write 차단** | 비인가 `places` setDoc 시도 | **PASS** | `permission-denied`로 안전하게 차단됨 (DB 불변) |
| **KTO Source Write 차단** | `kto-*` 소스 변조 setDoc 시도 | **PASS** | `permission-denied`로 안전하게 차단됨 (원천 불변) |
| **찜 목록 소유권 보호** | 타인 `users/{uid}/favorites` getDocs 시도 | **PASS** | `permission-denied`로 안전하게 차단됨 |

---

## 5. 최종 결론

1. **운영 백엔드 정합성 100% 완료**:
   신규 복합 인덱스 3개 및 보안 규칙 배포가 성공적으로 완료되어, GitHub Pages에 배포된 최신 프론트엔드(`be16183`)의 모든 기능(Home 추천, 32개 지역×업종 검색, 상세 조회 등)이 운영 라이브 환경에서 결함 없이 정상 동작합니다.

2. **운영 데이터 무결성 보존**:
   테스트 과정에서 시험용 장소 생성이나 상태 변경 등의 쓰기 작업을 일절 수행하지 않았으며, 운영 데이터 2,126건은 100% 무결한 상태를 유지하고 있습니다.

3. **최종 판정**: **PASS**
