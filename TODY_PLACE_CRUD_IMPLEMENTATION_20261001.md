# TODY PLACE CRUD IMPLEMENTATION — 2026-10-01

> Repository: `tonykks/DANGJEJU_2`  
> Working Branch: `feature/firestore-place-ui`  
> Author: Tody (Senior Software Engineer)  
> Model: `gpt-6-astra` (Codex CLI 0.155.1)  
> Target Design: `HANK_PLACE_CRUD_DESIGN_20261001.md` (Approved by Geni)  
> Status: IMPLEMENTATION & SELF-VERIFICATION COMPLETE  

---

## 1. 구현 개요

Hank가 설계하고 Geni가 정식 승인한 [HANK_PLACE_CRUD_DESIGN_20261001.md](file:///c:/Users/김광수/Desktop/DANGJEJU_2/HANK_PLACE_CRUD_DESIGN_20261001.md)에 따라, 장소 CRUD 확장 기능 전체(Create, Read, Update, Soft Delete, Restore, Rules, Index, Test Harness)를 구현 완료했습니다.

---

## 2. 변경 및 신규 파일 목록

### 2.1 신규 생성 파일
1. `src/lib/placeIdentity.ts`:
   - `PublicationStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN'` 정의.
   - `PUBLICATION_VISIBLE_STATUSES = ['DRAFT', 'PUBLISHED'] as const`.
   - `isPlaceId`: 기존 `kto-\d+` 및 신규 `owner-<uuid v4>` 형식 엄격 검증.
   - `ownerPlaceIdentity` & `ownerInputSource`: `OWNER_INPUT` Source envelope 자동 생성기 (`verificationStatus: "UNVERIFIED"`, `verifiedAt: null`, 관리자 개인정보 식별자 미포함).
   - `isCanonicalPlaceSource`: Place와 canonical Source의 상호 연결 무결성 검증.
2. `src/lib/placeInvalidation.ts`:
   - 관리자 CUD 작업 완료 시 캐시 및 쿼리 무효화(Invalidation) 버스 구현.
3. `src/components/AdminPlaceCrud.tsx`:
   - 관리자 화면의 CRUD UI 컴포넌트:
     - 4개 지역 × 8개 장소유형 조건 조회 및 상태별 탭 분리 (`정상 장소` / `삭제된 장소`).
     - 장소 목록 각 행 체크박스, 현재 페이지 전체 선택 및 조건 전체 선택 기능.
     - `[선택 장소 삭제]` 및 `[선택 장소 복원]` 액션 바 및 확인 다이얼로그 (건수, 물리 삭제 미수행 명시).
     - 5개 Place chunk 순차 트랜잭션 진행률 및 부분 결과(성공/충돌/실패) 상세 피드백.
     - `[새 장소 등록]` 모달 폼 (장소명, 지역, 업종 필수 및 53개 기존 필드 재사용).
4. `tests/placeCrud.test.ts`:
   - 신규 Place ID 규칙, `OWNER_INPUT` envelope 규격, `adaptPlace` 변환, 트랜잭션 플랜, 무효화 버스 등 15개 단위 테스트.
5. `tests/placeCrudRules.test.ts`:
   - Firestore Emulator 환경에서 동작하는 8개 정밀 보안 규칙 검증 스위트:
     1. active admin의 원자적 Place + OWNER_INPUT Source 동시 생성 허용 (단독 생성 거부, 비관리자 거부).
     2. DRAFT/PUBLISHED 각각의 Soft Delete(`HIDDEN`) 및 원상태 정확한 Restore 허용 (위조 거부).
     3. 5개 Place 일괄 트랜잭션의 상태 변경 및 audit 보존.
     4. 일반 사용자의 HIDDEN Place/Source 조회 및 접근 거부.
     5. 32개 지역×업종 조합 쿼리 정상 동작 및 커서 기반 페이지네이션.
     6. Dense Create의 선택 입력 생략 조합에 대한 1,000개 표현식 제한 회피 검증.
6. `tests/ui/` (로컬 데모 UI 하네스):
   - `serve.mjs`, `index.html`, `main.tsx`, `firebase.ts`, `README.md`: 운영 환경 연결 없이 에뮬레이터(`127.0.0.1:8185`)에만 연결되는 순수 로컬 테스트 화면.

### 2.2 수정 파일
1. `src/lib/placeAdapter.ts`:
   - `kto-*` ID 하드코딩 제거 -> `isPlaceId` 공통 validator 적용.
   - `OWNER_INPUT` Source 해석 지원: kto 객체가 없는 경우 빈 fallback으로 안전 처리, `primarySourceId` 우선 연결.
2. `src/lib/placeSearch.ts`:
   - `loadPlacesByIds`: ID 필터 일반화 및 `publicationStatus in ['DRAFT', 'PUBLISHED']` 질의 적용.
   - `loadHeroPlaces`: `publicationStatus in ['DRAFT', 'PUBLISHED']` 조건 추가.
   - `searchPlaces`: `publicationStatus in ['DRAFT', 'PUBLISHED']` 조건 추가.
   - `getPlace`: 공개 가시성 검증 분리.
3. `src/lib/adminPlaceEditor.ts`:
   - `loadAdminPlace`: KTO 필수 제약 제거 -> `KTO | OWNER_INPUT` Source 허용 및 무결성 검증.
   - `createAdminPlace`: 신규 Place와 OWNER_INPUT Source를 원자적 트랜잭션으로 생성.
   - `searchAdminPlacesByRegionAndCategory`: 지역(4) × 업종(8) 조건 조회 및 커서 기반 페이지네이션(limit 100).
   - `batchHideAdminPlaces` & `batchRestoreAdminPlaces`: 5개 단위 순차 트랜잭션, 직전 publicationStatus 보존 및 복원.
   - `buildAdminEditPlan`: `manualAdmin.previousPublicationStatus` 유실 방지 및 보존.
4. `src/lib/searchDerivation.ts` & `tools/firestore_place_search_fields/derive.py`:
   - `OWNER_INPUT` Source 분기 처리: KTO 전용 `collector.hasPetJoin` 및 `kto.pet` 검증 요구사항 완화, `ADMIN_CONFIRMED` 및 `UNKNOWN` 상태 지원.
   - TypeScript와 Python 간 완전한 암호학적/결정론적 hash & score parity 유지.
5. `src/components/AdminPlaceEditor.tsx`:
   - 기존의 단일 장소 이름 검색 수정 기능 유지.
   - 상단에 `[새 장소 등록]` 버튼 추가 및 신규 `AdminPlaceCrud` 탭/컴포넌트 통합.
6. `src/App.tsx` & `src/hooks/usePlaceQueries.ts`:
   - 상세 모달 진입 시 가시성 사전 검증 및 비공개 Place 차단.
   - 찜(Favorites) 목록 Drawer 오픈 시 현재 유효한 공개 상태 재검증.
   - 관리자 CUD 작업 완료 시 캐시 자동 무효화 리스너 연결.
7. `firestore.rules`:
   - `match /places/{placeId}`:
     - `allow create: if isActiveAdmin() && validOwnerPlaceCreate(placeId);` 추가.
     - `allow update`: 상태 변경 전용 fast path (`validPublicationTransition`)를 일반 필드 편집과 분리하여 1,000개 표현식 한도 초과 원천 차단.
   - `match /places/{placeId}/sources/{sourceId}`:
     - `allow create: if isActiveAdmin() && validOwnerInputSource(placeId, sourceId);` 추가.
     - 기존 KTO Source write 거부 유지, 모든 Source update/delete 거부 유지.
   - `{path=**}/sources/{sourceId}`: 부모 Place의 상태 검증 없는 public collectionGroup 읽기 전면 차단.
8. `firestore.indexes.json`:
   - Hank가 설계한 3개 복합 인덱스 정식 추가:
     - `places`: `publicationStatus` ASC, `search.version` ASC, `search.region` ASC, `search.category` ASC, `search.petSortKey` DESC
     - `places`: `publicationStatus` ASC, `search.version` ASC, `search.totalScore` DESC
     - `places`: `publicationStatus` ASC, `search.version` ASC, `search.region` ASC, `search.category` ASC, `name` ASC
9. `vite.config.ts`:
   - Windows esbuild 환경에서 `@` alias 해석 시 상위 경로 권한 오류를 방지하도록 `fileURLToPath(new URL('.', import.meta.url))`로 현대화.

---

## 3. 정적 검증 및 테스트 결과

| 검증 항목 | 실행 명령 / 도구 | 결과 | 세부 내용 |
|---|---|---|---|
| **TypeScript Typecheck / Lint** | `npm.cmd run lint` (`tsc --noEmit`) | **PASS** | 에러 0건. strict 타입 검사 통과. |
| **Vite Root Build** | `npm.cmd run build` | **PASS** | 1,724 modules transformed, 빌드 성공. |
| **Vite Pages Base Build** | `vite build --base=/DANGJEJU_2/` | **PASS** | GitHub Pages 경로 빌드 정상 완료 (8.63s). |
| **Node.js 통합 테스트** | `node --import tsx --test <all test files>` | **83 PASS / 0 FAIL / 0 SKIP** | 신규 CRUD 단위 테스트 및 기존 75개 테스트 전원 통과. |
| **Python Search Derivation Parity** | `python -m unittest discover tools/...` | **PASS** | TS/Python 해시 및 점수 parity 100% 일치. |
| **Firestore Rules Emulator Suite** | demo emulator port 8185 | **8 PASS / 0 FAIL** | 원자적 생성, 벌크 트랜잭션, HIDDEN 은닉, 32개 쿼리, 1000 expression 회피 검증 완료. |
| **Git Diff Format** | `git diff --check` | **PASS** | 공백/형식 결함 없음. |

---

## 4. Annie(독립 검증 Agent)를 위한 안내

1. **테스트 환경**:
   - 로컬 테스트는 `tests/placeCrudRules.test.ts` 및 `tests/placeCrud.test.ts`를 통해 Firestore 에뮬레이터(`demo-place-crud` / `demo-admin-place-editor-rules`)에서 실행 가능합니다.
   - 로컬 UI 하네스는 `node tests/ui/serve.mjs`로 3175 포트에 띄워 에뮬레이터 기반으로 브라우저 검증을 수행할 수 있습니다.
2. **운영 배포 경계**:
   - 승인되지 않은 Firebase Hosting 운영 배포, Firestore 운영 데이터 변경, PR/main merge는 일절 수행하지 않았습니다.
