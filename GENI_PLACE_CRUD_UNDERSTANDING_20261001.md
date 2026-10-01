# GENI PLACE CRUD UNDERSTANDING — 2026-10-01

> Repository: `tonykks/DANGJEJU_2`  
> Working Branch: `feature/firestore-place-ui`  
> Author: Geni (Antigravity Native Agent)  
> Target Document: `PLACE_CRUD_OWNER_REQUEST_20261001.md`  
> Reviewer: Toby  

---

## 1. 이번 작업의 목적

댕제주 서비스의 기존 장소 관리 화면(`AdminPlaceEditor`)을 확장하여, 기존 데이터와 스키마를 훼손하지 않으면서 **Create (신규 장소 등록)**, **Read (지역×업종 관리 조회)**, **Update (기존 장소 수정 유지)**, **Soft Delete (선택 장소 일괄 숨김)**, **Restore (선택 장소 일괄 복원)**이 가능한 **완전한 실질적 Place CRUD 관리 기능**으로 완성하는 것입니다.

핵심은 새로운 DB를 만들거나 스키마를 전면 재설계하는 것이 아니라, 프로젝트 초기에 설계된 **확장 가능한 Place DB Schema V1**의 자산(`publicationStatus`, `OWNER_INPUT` Source 체계, `search.*` 파생 필드 구조)을 최대한 활용하여 구현하는 데 있습니다.

---

## 2. 현재 구현 상태 분석

1. **관리자 화면 (`AdminPlaceEditor.tsx`, `adminPlaceEditor.ts`)**:
   - `#/admin/places` hash route를 통해 활성 관리자(`admins/{uid}`)에게만 노출.
   - 현재는 오직 **장소명 접두검색(최대 12개)**으로 기존 Place를 조회하여 필드를 하나씩 수정(Update)하는 단일 문서 편집 기능만 지원.
   - 신규 장소 등록(Create), 목록 다중 선택(Checkbox), 일괄 삭제(Soft Delete), 삭제 목록 조회 및 복원(Restore) 기능은 부재.

2. **KTO 전용 강결합 (하드코딩된 가정들)**:
   - `src/lib/placeAdapter.ts`: `if (data.placeId !== document.id || !/^kto-\d+$/.test(document.id))`로 Place ID가 `kto-*` 형태여야만 동작하도록 강제됨.
   - `src/lib/adminPlaceEditor.ts`: `loadAdminPlace`에서 `source.data.source !== 'KTO'`인 경우 예외를 발생시키며, Source 내 `kto` 객체가 반드시 존재한다고 가정.
   - `src/lib/placeSearch.ts`: `loadPlacesByIds`에서 ID 필터링 시 `/^kto-\d+$/` 정규식을 통과한 ID만 조회하도록 제한되어 있어, 신규 등록 장소가 찜 목록에서 누락될 위험 존재.
   - `src/lib/searchDerivation.ts`: `collector.hasPetJoin` 및 `kto.pet` 존재 여부를 검증하고 있어, `OWNER_INPUT` 소스 등록 시 불필요한 예외 발생 가능.

3. **Firestore Security Rules (`firestore.rules`)**:
   - `match /places/{placeId}`: `allow create, delete: if false;`로 신규 등록 및 물리 삭제가 완전 차단되어 있음.
   - `match /places/{placeId}/sources/{sourceId}`: `allow write: if false;`로 하위 Source 문서 생성이 차단되어 있음.
   - 오직 활성 관리자의 `update`만 1,000개 표현식 한도 내에서 정밀하게 허용된 상태.

4. **Firestore Indexes (`firestore.indexes.json`)**:
   - 현재 `places` 컬렉션은 `search.version`, `search.region`, `search.category`, `search.petSortKey` 복합 인덱스와 `search.version`, `search.totalScore` 복합 인덱스만 보유.
   - `publicationStatus`를 포함한 복합 인덱스는 아직 없음.

5. **기존 데이터의 `publicationStatus` 현황**:
   - `tools/firestore_place_pilot_import/import_pilot.py` 및 풀 임포트 기준으로 모든 기존 Place의 `publicationStatus`는 초기값인 `"DRAFT"`로 저장되어 서비스되고 있음.

---

## 3. 기존 기능 중 반드시 보존할 것

- **사용자 인증 & 찜**: Google 로그인 / 로그아웃 및 사용자별 찜(`users/{uid}/favorites/{placeId}`) 보존.
- **일반 사용자 화면**:
  - 홈 화면 Hero 추천 (`search.totalScore >= 12`, 상위 5개)
  - 지역(4개) × 장소유형(8개) Query-first 검색 및 정렬 (`search.petSortKey` DESC)
  - 지도(`JejuMap`), 카드(`PlaceCard`), 목록(`PlaceListItem`), 상세 모달(`PlaceDetailModal`)의 정상 동작
- **관리자 기능**:
  - 기존 업체명 접두검색(12개 제한) 및 기존 단일 Place 수정 기능
  - `admins/{uid}` 기반의 활성 관리자 인증 및 비인가자 차단 계약
- **데이터 & 보안 무결성**:
  - 기존 2,126건 KTO Source 데이터의 불변성(Immutable) 유지
  - Firestore Rules 보안 계약(일반 사용자 write 금지, admins 컬렉션 client write 금지, favorites 소유자 계약 등) 엄격 유지
  - `search.*` 파생 필드 점수 체계 및 해시 무결성 유지

---

## 4. 새로 구현할 기능 상세

### 4.1 신규 장소 등록 (Create)
- 관리자 화면에 `[새 장소 등록]` 모달/폼 제공 (기존 `AdminPlaceEditor`의 입력 필드 및 UI 구조 재사용).
- 관리자는 실제 장소 정보만 입력.
- 시스템이 자동 생성하는 내부 필드:
  - `placeId`: `owner-{timestamp}-{random}` 등 기존 `kto-{contentId}`와 충돌하지 않는 고유 ID 자동 생성.
  - `source`: `OWNER_INPUT`으로 설정.
  - `primarySourceId`: 생성된 `sourceId` 자동 연결.
  - `search.*`: `searchDerivation` 로직을 통해 지역, 장소유형, 기본점수, 펫점수, 펫티어, 정렬키, inputHash 등 자동 계산.
  - `audit / provenance`: 생성 시각, 수정 시각, 관리자 식별자 등 안전 처리.
- 생성 즉시 일반 사용자 화면(검색, 카드, 지도, 상세, 찜)에서 정상 노출 및 상호작용 가능.

### 4.2 관리자 조회 (Read)
- 기존 업체명 접두검색 유지.
- 추가로 **지역(4개) × 업종(8개)** 조합 필터 조회 제공:
  - 지역: 제주시, 서귀포시, 동부, 서부
  - 업종: 관광지, 카페, 음식점, 쇼핑, 숙박, 레포츠, 문화시설, 축제·공연·행사
- 관리자용 조회는 12개 제한을 두지 않고, 해당 조건의 관리 대상 장소들을 충분히 조회 및 관리할 수 있도록 구성.

### 4.3 다중 선택 UI
- 조회된 장소 목록 좌측에 체크박스 배치.
- 개별 선택, 전체 선택, 전체 선택 해제, 선택된 항목 수 카운터 표시.
- 액션 바: `선택 장소 삭제` 및 `선택 장소 복원` 버튼 제공.

### 4.4 삭제 처리 (Soft Delete)
- Firestore Document의 물리적 영구 삭제(`deleteDoc`)는 철저히 금지.
- 선택된 장소들의 `publicationStatus`를 `"HIDDEN"`으로 일괄 업데이트.
- 삭제 전 확인 다이얼로그 표시 (대상 건수 명시 및 복원 가능 안내).
- **일반 서비스 제외**: `publicationStatus == "HIDDEN"`인 장소는 홈 추천, 지역×업종 검색, 카드/목록, 지도, 상세 진입, 찜 목록 표시에서 모두 노출 제외.
- 찜 데이터 보존: 기존 사용자의 Favorite 문서는 절대 삭제하지 않으며, 복원 시 다시 정상 표시되도록 보장.

### 4.5 삭제된 장소 관리 및 복원 (Restore)
- 관리자 화면에서 '삭제된 장소(`publicationStatus == HIDDEN`)' 탭/뷰 분리 제공.
- 삭제된 장소 화면에서도 지역×업종 필터 및 다중 체크박스 선택 지원.
- `[선택 장소 복원]` 실행 시 일괄로 원래 상태(예: `DRAFT`)로 복원.
- 복원 완료/실패 건수 명확히 피드백.
- 복원 후 일반 사용자 화면 및 찜 목록에 즉시 재노출.

### 4.6 일괄 처리 안정성
- 다중 선택 시 Firestore 배치 제한(최대 500개) 및 네트워크 안정성을 고려하여 안전한 chunk 단위 트랜잭션/배치 처리.
- 부분 실패 시 성공 건수와 실패 건수를 명확히 보고.

---

## 5. 하지 않을 일 (Explicit Non-Goals)

1. **DB Schema 전면 재설계 금지**: 기존 설계된 필드 구조를 그대로 사용하며 불필요한 필드를 증설하지 않음.
2. **`deleted=true/false` 별도 필드 신설 금지**: 기존 스키마에 존재하는 `publicationStatus`를 Soft Delete 상태로 전용.
3. **불필요한 2,126건 전체 마이그레이션 금지**: 기존 문서를 전수 수정하지 않음.
4. **Firestore Document 물리 삭제 금지**: Rules와 클라이언트 코드 양쪽에서 `delete`는 `false`로 유지.
5. **KTO 원본 Source 수정 금지**: 기존 KTO 출처 문서는 immutable 보존.
6. **전체 Catalog 클라이언트 선로딩 복원 금지**: Query-first 원칙 고수.
7. **중복 데이터 컬렉션(`listView` 등) 신설 금지**.
8. **관리자에게 내부 기술값(ID, 해시, 점수 등) 수동 입력 요구 금지**.
9. **승인 없는 외부 운영 배포 금지**: Owner의 별도 승인 전 PR merge, main merge, Firebase Hosting/GitHub Pages 운영 배포 금지.

---

## 6. DB Schema 재설계 여부

- **결론: 재설계하지 않음.**
- 초기 설계(`DB_SCHEMA_DESIGN_TASK.md`)에 이미 정의된 `publicationStatus`와 `OWNER_INPUT` Source 체계, `adminOverrides`, `manualAdmin` 구조를 완벽히 수용하여 구현합니다.

---

## 7. publicationStatus 사용 원칙

- **정상 노출 상태**: 현재 기존 데이터의 기본값인 `"DRAFT"` (또는 향후 명시적 `"ACTIVE"` 확정 시 해당 값).
- **삭제(숨김) 상태**: `"HIDDEN"`.
- **복원 시**: `"HIDDEN"`에서 삭제 직전의 정상 노출 상태(`"DRAFT"`)로 원복.
- **일반 화면 필터링**: 일반 사용자가 조회하는 모든 경로(검색 쿼리, 지도, 상세, 찜)에서 `publicationStatus === "HIDDEN"`인 문서는 철저히 차단.

---

## 8. Source / Provenance 처리 원칙

- **KTO 데이터**: `source: "KTO"`, immutable 유지.
- **신규 관리자 데이터**: `source: "OWNER_INPUT"`.
  - 서브컬렉션: `places/{placeId}/sources/{sourceId}`에 `OWNER_INPUT` 소스 도큐먼트 기록.
  - 필수 키: `placeSourceId`, `placeId`, `source: "OWNER_INPUT"`, `sourceUpdatedAt`, `verifiedAt`, `verificationStatus: "ADMIN_CONFIRMED"`, `adminInput` 정보 보존.
  - 내부 기술값은 프로그램이 자동 생성 및 무결성 보장.

---

## 9. 신규 Place ID 처리 원칙

- **ID 규칙**: 기존 `kto-{contentId}`와 겹치지 않는 명확한 네임스페이스 채택 (예: `owner-{timestamp}-{nanoid}` 또는 `owner-{uuid}`).
- **코드베이스 내 KTO ID 전제 제거**:
  - `placeAdapter.ts`: `id.startsWith('kto-')` 및 `/^kto-\d+$/` 단언 제거, 유연한 ID 허용.
  - `placesCatalog.ts` / `placeSearch.ts`: `loadPlacesByIds` 등에서 `kto-*`만 통과시키는 필터 완화.
  - `adminPlaceEditor.ts`: `loadAdminPlace`에서 KTO Source 강제 검사 제거 및 `OWNER_INPUT` Source 처리 지원.

---

## 10. Firestore Rules 영향 분석

1. **Place Create**:
   - `match /places/{placeId}`에서 `allow create: if isActiveAdmin() && validPlaceCreate(placeId);` 허용 필요.
   - `validPlaceCreate`: 필수 필드 구조, `OWNER_INPUT` Source 일치 여부, 기본 `publicationStatus`, `search.*` 파생 필드 유효성, `updatedAt == request.time` 검증.
2. **Place Update (Soft Delete / Restore)**:
   - `publicationStatus` 변경이 `validPlaceUpdate`에 안전하게 포함되도록 Rules 업데이트.
   - 일반 필드 수정과 Soft Delete(`publicationStatus -> HIDDEN`) 및 Restore(`HIDDEN -> DRAFT`)의 상태 전이 규칙 검증.
3. **Source Write**:
   - `match /places/{placeId}/sources/{sourceId}`에서 `allow create: if isActiveAdmin() && request.resource.data.source == 'OWNER_INPUT' && validOwnerInputSource(placeId, sourceId);` 형태로 최소 허용.
   - 기존 KTO Source에 대한 수정/삭제는 계속 `allow write: if false;`로 차단.
4. **보안성 유지 & Expression Limit 최적화**:
   - 일반 사용자 write 전면 차단 유지.
   - 물리적 Document delete 전면 차단 유지.
   - 1,000개 표현식 한도(`maximum of 1000 expressions reached`)를 초과하지 않도록 Rules 평가식 최적화 및 철저한 사전 검증.

---

## 11. Firestore Index 영향 분석

- 현재 일반 사용자 검색:
  - `where('search.version', '==', 1)`
  - `where('search.region', '==', region)`
  - `where('search.category', '==', category)`
  - `orderBy('search.petSortKey', 'desc')`
- 여기에 `publicationStatus` 조건을 결합할 경우:
  - 방법 A: Firestore 쿼리 조건에 `where('publicationStatus', '!=', 'HIDDEN')` 또는 `where('publicationStatus', '==', 'DRAFT')`를 추가하는 경우 -> 새 Composite Index 필요 (`firestore.indexes.json`에 추가 및 빌드).
  - 방법 B: 관리자용 삭제 조회 `where('publicationStatus', '==', 'HIDDEN')`에 대한 인덱스 필요 여부 검토.
- Hank 설계 단계에서 인덱스 수용 한도, 쿼리 비용, 쿼리-인덱스 조합을 엄밀히 분석하여 최적안 확정 예정.

---

## 12. Query-first 영향 분석

- 전체 Catalog(~2,126건)를 브라우저로 내려받는 방식은 일절 복원하지 않음.
- 관리자 화면의 지역×업종 조회 역시 Firestore의 `search.region`과 `search.category`를 조건으로 하는 질의를 사용하여 필요한 데이터만 효율적으로 가져옴.
- 기존의 Firestore Quota 보호 및 에러 가드(`guardedFirestoreRead`)를 일괄 작업 시에도 동일하게 적용.

---

## 13. 테스트 및 검증 계획

1. **단위 테스트 (Unit Tests)**:
   - 신규 Place ID 생성 및 파싱 검증
   - `placeAdapter`의 `OWNER_INPUT` Place/Source 변환 검증
   - `searchDerivation`의 `OWNER_INPUT` 대상 파생 필드 계산 및 해시 무결성 검증
   - Admin UI 일괄 선택 및 상태 계산 로직 검증
2. **Firestore Rules 테스트 (Emulator)**:
   - 활성 관리자의 신규 Place 등록 허용 / 일반 사용자 등록 거부
   - 활성 관리자의 `OWNER_INPUT` Source 생성 허용 / KTO Source 쓰기 거부
   - 활성 관리자의 `publicationStatus` 변경(Soft Delete / Restore) 허용 / 일반 사용자 변경 거부
   - 물리적 Place Delete 거부 (관리자 포함 전체 거부)
   - Rules 1,000개 표현식 한도 초과 여부 검증
3. **기능 & 통합 E2E 테스트**:
   - 신규 장소 등록 -> 일반 사용자 검색/지도/상세/찜 반영 확인
   - 단일 및 다중 장소 Soft Delete -> 일반 사용자 화면에서 은닉 확인 -> 관리자 삭제 목록 노출 확인
   - 단일 및 다중 장소 Restore -> 일반 사용자 화면 재노출 및 찜 복원 확인
   - 4개 지역 × 8개 업종 전체 32개 조합 쿼리 정상 동작 확인
4. **회귀 검증**:
   - 기존 KTO 데이터 검색, 정렬, 상세 모달, 찜 기능 완벽 보존 확인
   - `npm run lint`, `npm run build`, Python/Node 테스트 전체 PASS

---

## 14. Acceptance 조건 (21개 기준)

1. 기존 DB Schema를 최대한 그대로 사용
2. 기존 `publicationStatus`를 Soft Delete 상태 관리에 사용
3. 새 `deleted` boolean 필드 미생성
4. 불필요한 2,126건 전체 마이그레이션 미수행
5. 신규 장소는 `OWNER_INPUT` provenance로 구분
6. KTO 원본 Source 불변 유지
7. 신규 장소 ID 자동 생성 및 기존 KTO ID 충돌 방지
8. 기존 업체명 검색 및 개별 수정 기능 정상 유지
9. 지역(4) × 업종(8) 관리 조회 제공
10. 조회 결과 다중 체크박스 선택 가능
11. 일괄 Soft Delete 기능 정상 동작
12. 실제 Firestore Document는 물리 삭제되지 않음
13. `HIDDEN` 장소의 일반 서비스 노출 완전 차단
14. 삭제된 장소를 관리자가 별도 조회 가능
15. 다중 Restore 기능 정상 동작
16. Restore 후 일반 서비스에 정상 재노출
17. `OWNER_INPUT` Place도 검색/지도/상세/찜에서 완전 정상 동작
18. 일반 사용자의 Create/Hide/Restore/Admin 변경 차단
19. Rules / Index / Query-first 구조 안전 유지
20. 기존 기능 일체 회귀 없음
21. Annie 독립 검증 PASS

---

## 15. 잠재 위험 및 대응 방안

| 잠재 위험 | 대응 방안 |
|---|---|
| **Firestore Rules 표현식 1000개 한도 초과** | 신규 Create/Update 규칙 추가 시 중복 평가를 최소화하고, helper 함수 분리 및 조건문 단락 평가(short-circuit) 최적화 적용. Emulator를 통해 엄밀히 검증. |
| **복합 인덱스 변경에 따른 쿼리 차단** | `publicationStatus` 필터가 복합 인덱스에 미치는 영향을 사전에 검토하고, 인덱스 빌드 전 쿼리 실패가 없도록 안전한 쿼리 설계. |
| **다중 일괄 처리 시 Quota 및 Batch 한도** | Firestore의 500개 write 한도를 고려하여 20~30개 단위 chunk 처리 및 트랜잭션 에러 복구/보고 로직 구현. |
| **Agent 역할 분리 미준수 위험** | Geni가 임의로 Hank/Tody/Annie 역할을 단독 수행하지 않고, 각 단계별로 지정된 도구와 모델(`gpt-6-astra`, `Gemini`)을 호출하여 독립적 산출물과 검증을 확보. |

---

## 16. Owner 판단이 추가로 필요한 사항 유무

- **현재 시점: 없음.**
- `PLACE_CRUD_OWNER_REQUEST_20261001.md`에 목적, 배경, 제약조건, 승인 범위가 매우 명확하게 정의되어 있으므로 불필요한 질의로 작업을 지연시키지 않습니다.
- 세부적인 기술 구현 상세(인덱스 설계 최적화 등)는 다음 단계인 Hank의 설계 문서(`HANK_PLACE_CRUD_DESIGN_20261001.md`)에서 구체화한 후 Geni가 Owner 요구사항과 대조하여 엄격히 검토하겠습니다.

---

## 17. 다음 협업 진행 단계

1. **현재 완료**: Geni 요구사항 분석 및 이해 문서 작성 (`GENI_PLACE_CRUD_UNDERSTANDING_20261001.md`) 및 GitHub 푸시.
2. **검토 대기**: Owner 전달 및 Toby 검토.
3. **후속 실행 (Toby 승인 후)**:
   - **Hank (`gpt-6-astra`)**: `HANK_PLACE_CRUD_DESIGN_20261001.md` 작성 (설계 및 영향 분석)
   - **Geni**: Hank 설계안 검토 및 승인
   - **Tody (`gpt-6-astra`)**: `TODY_PLACE_CRUD_IMPLEMENTATION_20261001.md` 및 코드 구현
   - **Annie (`Gemini`)**: `ANY_PLACE_CRUD_VERIFICATION_20261001.md` 작성 및 독립 테스트/검증
   - **Geni**: 최종 통합 및 완료 보고
