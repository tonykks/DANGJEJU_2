# PLACE CRUD OWNER REQUEST — 2026-10-01

> Repository: `tonykks/DANGJEJU_2`  
> Working branch: `feature/firestore-place-ui`  
> Owner: 김광수  
> Purpose: 기존 장소 관리 화면을 확장하여 Create / Read / Update / Soft Delete / Restore까지 가능한 관리 기능으로 완성한다.

---

## 1. Owner의 생각 — 쉬운 언어

나는 기존 DB Schema를 새로 만들거나 크게 변경하고 싶지 않다.

처음 DB를 설계할 때 앞으로 새로운 데이터나 기능이 추가될 것을 고려하여 확장 가능한 구조로 만들었으므로, 이번에도 그 구조를 최대한 그대로 사용하고 싶다.

현재 관리자 장소정보 관리 화면에서는 기존 장소를 검색하고 비어 있는 정보를 추가하거나 기존 정보를 수정할 수 있다.

이번에는 여기에 다음 기능을 추가하고 싶다.

1. 새로운 장소 등록
2. 기존 장소 삭제 처리
3. 삭제한 장소 복원
4. 업체명 검색뿐 아니라 지역과 업종을 조합한 관리용 조회
5. 조회된 여러 업체를 체크박스로 선택하여 일괄 삭제
6. 삭제된 장소도 여러 개를 선택하여 일괄 복원

새 장소 등록은 현재 만들어져 있는 장소 Schema와 관리자 입력 화면을 최대한 그대로 재사용하면 된다.

기존 KTO 데이터는 Source=KTO로 그대로 보존하고, 관리자가 직접 새로 등록한 데이터는 기존 Schema에 정의된 OWNER_INPUT Source로 구분하면 된다.

ID나 Source ID 같은 내부 기술값은 관리자가 직접 입력하지 않고 프로그램이 자동으로 생성해야 한다.

삭제는 실제 Firestore Document를 지우는 방식으로 하지 않는다.

기존 Schema에 이미 존재하는 `publicationStatus`를 사용하고, 삭제된 장소는 `HIDDEN` 상태로 변경하여 일반 사용자 화면에서 보이지 않게 한다.

삭제된 데이터는 관리자 화면에서 다시 찾아 복원할 수 있어야 한다.

새로운 `deleted=true/false` 같은 별도의 삭제 필드는 만들지 않는다.

지역은 현재 서비스의 4개 지역, 업종은 현재 서비스의 8개 종류를 그대로 사용한다.

예를 들어:

- 지역: 서부
- 업종: 카페

를 선택하면 해당 업체를 모두 보여주고, 각 업체 왼쪽에 체크박스를 표시한다.

여러 업체를 선택한 뒤 `선택 장소 삭제`를 누르면 선택된 장소 전체를 `HIDDEN` 처리한다.

삭제된 장소 관리 화면에서도 같은 방식으로 여러 업체를 선택하여 한 번에 복원할 수 있어야 한다.

기존 업체명 검색과 한 업체씩 수정하는 기능은 그대로 유지한다.

내 목적은 새로운 DB를 만드는 것이 아니라, 처음 만들어 둔 확장 가능한 DB Schema를 이용해서 장소 DB 관리 기능을 실제 CRUD 관리 기능으로 완성하는 것이다.

---

## 2. 이번 작업의 핵심 원칙

### 2.1 기존 Schema 재사용

- 기존 Place Schema를 최대한 그대로 사용한다.
- 새 `deleted` boolean을 추가하지 않는다.
- 기존 `publicationStatus`를 Soft Delete 상태 관리에 사용한다.
- 기존 KTO Source 원문은 수정하지 않는다.
- 기존 Query-first 구조를 유지한다.
- 전체 Catalog 선로딩 방식으로 되돌리지 않는다.
- 불필요한 2,126건 전체 Migration을 하지 않는다.

### 2.2 Source / Provenance

기존 KTO 장소:

```text
source = KTO
```

관리자가 직접 신규 등록한 장소:

```text
source = OWNER_INPUT
```

기존 Schema에 이미 정의된 Source 체계를 사용한다.

관리자가 직접 입력하지 않아야 하는 내부 정보:

- placeId
- sourceId
- primarySourceId
- search hash
- score
- derivedAt
- provenance 내부키
- audit 내부값

이 값들은 프로그램이 자동 생성·관리한다.

### 2.3 Soft Delete

실제 Firestore Document 삭제는 금지한다.

삭제:

```text
publicationStatus -> HIDDEN
```

복원:

삭제 직전 상태로 되돌리는 것을 원칙으로 한다.

현재 데이터의 실제 publicationStatus 분포를 먼저 확인하고, 가장 단순하면서도 원상복구가 확실한 방식을 선택한다.

---

## 3. 기존 기능 중 반드시 보존할 것

다음 기능은 현재 정상 동작 상태를 유지해야 한다.

- Google 로그인 / 로그아웃
- 사용자별 찜
- Home 추천
- 지역 × 업종 Query-first 검색
- 지도
- 카드 / 목록
- 장소 상세
- 기존 업체명 접두검색
- 기존 관리자 Place 수정
- 관리자 UID 기반 권한 확인
- KTO Source immutable
- Firestore Rules 보안 계약
- search 파생값
- 기존 Audit 구조

---

## 4. 신규 장소 등록 — Create

관리자 화면에 `새 장소 등록` 기능을 추가한다.

기존 AdminPlaceEditor와 현재 Place Schema를 최대한 재사용한다.

관리자가 입력할 것은 실제 장소 정보이며 내부 ID / Source / 검색용 파생값은 직접 입력하지 않는다.

### 필수 원칙

- 신규 Place ID는 기존 `kto-{contentId}`와 충돌하지 않는 규칙으로 자동 생성
- 신규 Source는 `OWNER_INPUT`
- 신규 Place가 기존 일반 사용자 기능 전체에서 정상 동작해야 함
  - 지역×업종 검색
  - 카드/목록
  - 지도
  - 상세
  - 찜
- search 필드는 기존 derivation 규칙으로 자동 생성
- 기존 KTO ID / KTO Source 규칙은 변경하지 않음

현재 코드에 존재하는 KTO 전용 가정을 실제 코드에서 찾아 제거 또는 일반화한다.

특히 확인할 것:

- Place ID가 `/^kto-\d+$/` 형태여야 한다는 가정
- `loadPlacesByIds`가 kto-*만 받는 부분
- `loadAdminPlace`가 KTO Source를 반드시 요구하는 부분
- Place Adapter의 KTO ID 전제
- Source가 항상 KTO라고 가정하는 코드
- OWNER_INPUT Place가 favorites / detail / search에서 실패할 가능성

---

## 5. 관리자 조회 — Read

기존 업체명 검색은 그대로 유지한다.

추가로 지역 + 업종 조합 관리 조회를 제공한다.

### 지역 4개

- 제주시
- 서귀포시
- 동부
- 서부

### 업종 8개

- 관광지
- 카페
- 음식점
- 쇼핑
- 숙박
- 레포츠
- 문화시설
- 축제·공연·행사

현재 존재하는:

```text
search.region
search.category
```

를 재사용한다.

관리자 지역×업종 조회에서는 기존 업체명 접두검색의 12개 제한을 그대로 적용하지 않는다. 해당 조건의 관리 대상 업체를 실제로 관리할 수 있어야 한다.

---

## 6. 다중 선택

지역×업종 조회 결과 각 장소 왼쪽에 체크박스를 둔다.

필요 기능:

- 개별 선택
- 전체 선택
- 전체 선택 해제
- 선택 개수 표시
- 선택한 장소 일괄 삭제
- 선택한 장소 일괄 복원

일괄 처리 전에는 대상 개수를 사용자에게 확인시킨다.

---

## 7. 삭제 — Soft Delete

`선택 장소 삭제`를 누르면 실제 Document를 삭제하지 않는다.

선택된 Place들의:

```text
publicationStatus = HIDDEN
```

으로 변경한다.

삭제 확인 Dialog를 표시한다.

예:

```text
선택한 12개 장소를 삭제 처리하시겠습니까?
실제 데이터는 삭제되지 않으며 관리자 화면에서 복원할 수 있습니다.
```

### 일반 사용자 화면에서 HIDDEN 제외

HIDDEN 장소는 다음에서 노출되면 안 된다.

- Home 추천
- 지역×업종 검색
- 카드/목록
- 지도
- 상세보기 직접 진입
- 찜 목록의 Place 표시

단, Soft Delete 때문에 기존 Favorite Document를 임의 삭제하지 않는다.

복원 시 기존 Favorite 관계가 다시 정상 동작할 수 있어야 한다.

---

## 8. 삭제된 장소 관리 / Restore

관리 UI에서 최소한 다음 두 상태를 명확히 구분한다.

- 정상 장소
- 삭제된 장소

삭제된 장소에서는 `publicationStatus == HIDDEN`인 장소를 조회한다.

삭제된 장소 화면에서도 지역×업종 필터를 사용할 수 있게 한다.

여러 장소 선택 후:

```text
[선택 장소 복원]
```

으로 일괄 복원할 수 있어야 한다.

복원 전 대상 개수를 확인하고, 복원 완료/실패 결과를 명확히 표시한다.

복원 후 일반 사용자 화면에 다시 정상 노출되어야 한다.

---

## 9. Firestore Rules

현재 보안 원칙을 약화시키지 않는다.

반드시 만족할 것:

- 일반 사용자 Place create 금지
- 일반 사용자 Place update 금지
- 일반 사용자 hide / restore 금지
- 실제 Place delete 금지
- active admin만 신규 Place 등록 가능
- active admin만 기존 Place 수정 가능
- active admin만 HIDDEN / Restore 가능
- 기존 KTO Source write 금지 유지
- OWNER_INPUT Source에 필요한 write만 최소 권한으로 허용
- protected/internal search field 임의 위조 금지
- 관리자 권한 상승 차단
- favorites owner-only 계약 유지
- `admins/{uid}` client write 금지 유지

Rules를 넓게 허용하지 말고 필요한 경로와 필드만 최소한으로 허용한다.

---

## 10. Firestore Index

`publicationStatus`, `search.region`, `search.category`, 정렬 조건이 결합되면서 새 Composite Index가 필요한지 실제 Query 기준으로 검토한다.

필요한 Index만 `firestore.indexes.json`에 추가한다.

Query-first 구조는 유지한다.

---

## 11. 일괄 처리 안정성

다중 Soft Delete / Restore는 Firestore write 제한을 고려해 안전하게 구현한다.

다수 선택 시:

- 일부만 처리되고 전체 성공으로 보이는 상태 금지
- 실패 항목이 있으면 사용자에게 정확히 알림
- 필요 시 안전한 batch/chunk 처리
- 성공 건수 / 실패 건수 확인 가능

---

## 12. 최초 상태 확인

코드 수정 전에 현재 원격 상태와 Project 기준 문서를 읽는다.

Local Project에서 `agent-collab-kit`의 Reading Protocol을 따른다.

최소 확인 대상:

1. `agent-collab-kit/README.md`
2. `PROJECT_INTENT.md`
3. `STATE.md`
4. `DECISIONS.md`
5. `requirement.md`
6. `DB_SCHEMA_DESIGN_TASK.md`
7. `firestore.rules`
8. `firestore.indexes.json`
9. 관련 source code
10. 관련 tests

현재 Project V2 기준에서 `BRIEF.md`는 사용하지 않는다.

---

## 13. Geni 이해 확인 단계

이 문서를 읽은 후 바로 구현하지 않는다.

먼저 다음 파일을 작성한다.

```text
GENI_PLACE_CRUD_UNDERSTANDING_20261001.md
```

여기에는 최소한 다음을 기록한다.

- 이번 작업의 목적
- 현재 구현 상태
- 기존 기능 중 반드시 보존할 것
- 새로 구현할 기능
- 하지 않을 일
- DB Schema 재설계 여부
- publicationStatus 사용 원칙
- Source / Provenance 처리 원칙
- 신규 Place ID 처리 원칙
- Firestore Rules 영향
- Firestore Index 영향
- Query-first 영향
- 테스트 계획
- Acceptance 조건
- 잠재 위험
- Owner 판단이 추가로 필요한 사항 유무

이 파일을 `feature/firestore-place-ui` branch에 commit/push한다.

그 후 Owner에게는 장문의 설명을 하지 말고 다음과 같이만 보고한다.

```text
PLACE_CRUD_OWNER_REQUEST_20261001.md를 모두 읽고 이해했습니다.
GENI_PLACE_CRUD_UNDERSTANDING_20261001.md에 제가 이해한 내용을 정리하여 GitHub에 올렸습니다.
Toby가 검토할 수 있습니다.
```

Owner가 이 완료 보고를 Toby에게 전달하면 Toby가 이해 내용을 검토한다.

---

## 14. 이해 확인 후 개발 협업 방식

Toby가 Geni 이해 내용을 확인한 뒤 별도 보완 요구가 없으면 다음 순서로 진행한다.

### Hank — 설계 / 영향 분석

실제 별도 Agent로 실행한다.

- Agent: Hank
- Model: 반드시 `gpt-6-astra`
- 역할: 구현 전 설계 / 영향 분석

결과 문서:

```text
HANK_PLACE_CRUD_DESIGN_20261001.md
```

Hank는 최소한 다음을 확인한다.

- 실제 `publicationStatus` 존재 및 현재 분포
- 기존 Schema의 확장 가능 구조
- Source / Provenance
- KTO 전용 가정
- 신규 OWNER_INPUT Place 지원 방법
- Soft Delete / Restore
- Query-first
- Rules
- Index
- 일괄 처리
- 테스트 영향

Hank는 이 단계에서 구현하지 않는다.

### Geni — 설계 승인

Geni는 Hank 설계를 Owner 요구사항과 대조한다.

문제가 있으면 Hank에게 재설계를 요청한다.

승인 범위 안에서 충분히 안전하면 Owner에게 중간 승인을 요청하지 않고 다음 단계로 간다.

### Tody — 구현

실제 별도 Agent로 실행한다.

- Agent: Tody
- Model: 반드시 `gpt-6-astra`
- 역할: 승인된 설계 구현

결과 문서:

```text
TODY_PLACE_CRUD_IMPLEMENTATION_20261001.md
```

### Annie — 독립 테스트 / 검증

구현자와 분리하여 독립 검증한다.

가능한 현재 Project 기준의 최고 Gemini 검증 Model을 사용하고 실제 사용 Model을 기록한다.

결과 문서:

```text
ANY_PLACE_CRUD_VERIFICATION_20261001.md
```

Annie가 FAIL 또는 PARTIAL을 발견하면 Geni가 원인을 분류한다.

- 설계 문제 → Hank
- 구현 문제 → Tody
- 수정 후 → Annie 재검증

승인 범위 안에서는 Owner에게 중간 승인 요청 없이 PASS까지 반복한다.

---

## 15. 필수 검증

### 기존 기능 회귀

- 기존 KTO 장소 검색
- Home 추천
- 지역×업종 검색
- 지도
- 상세
- 로그인
- 찜
- 관리자 진입
- 기존 Place 수정
- KTO Source immutable

### Create

- OWNER_INPUT 장소 신규 생성
- ID 충돌 없음
- validation
- search 파생값 정상
- 지역×업종 검색 가능
- 카드/지도/상세 정상
- favorites 정상
- 새로고침 후 유지

### Soft Delete

- 단일 HIDDEN
- 다중 HIDDEN
- 일반 검색에서 제외
- Home/Map/List/Detail/Favorites 표시에서 제외
- Firestore Document 자체는 유지
- Source 보존
- Favorite Document 임의 삭제 없음

### Restore

- 단일 복원
- 다중 복원
- 원래 publication 상태 복원
- 일반 화면 재노출
- 기존 Favorite 관계 정상

### 관리자 필터

4개 지역 × 8개 업종의 전체 32개 조합이 Query 오류 없이 처리되는지 자동 검증한다.

### Security Rules

- 일반 사용자 create 거부
- 일반 사용자 hide/restore 거부
- protected field 수정 거부
- active admin create 허용
- active admin hide/restore 허용
- physical delete 거부
- KTO Source write 거부
- 허용되지 않은 Source 위조 거부
- OWNER_INPUT 허용 범위 밖 write 거부
- admins 권한 상승 거부
- favorites owner-only 유지

### Quality

- lint
- build
- unit tests
- Firestore Rules tests
- Firestore Emulator
- Python search derivation regression
- UI/E2E
- `git diff --check`

운영 Firebase 데이터를 destructive test에 사용하지 않는다.

Create / Hide / Restore는 우선 Emulator / local test 환경에서 검증한다.

---

## 16. Acceptance Criteria

다음이 모두 충족되어야 최종 PASS다.

1. 기존 DB Schema를 최대한 그대로 사용한다.
2. 기존 `publicationStatus`를 Soft Delete에 사용한다.
3. 새 `deleted` boolean을 만들지 않는다.
4. 불필요한 2,126건 전체 Migration을 하지 않는다.
5. 신규 장소는 `OWNER_INPUT` provenance로 구분된다.
6. KTO 원본 Source는 수정되지 않는다.
7. 신규 장소 ID는 자동 생성되고 기존 KTO ID와 충돌하지 않는다.
8. 업체명 검색과 기존 수정 기능이 정상 유지된다.
9. 지역 4 × 업종 8 관리 조회가 가능하다.
10. 조회 결과 다중 checkbox 선택이 가능하다.
11. 일괄 Soft Delete가 가능하다.
12. 실제 Firestore Document는 삭제되지 않는다.
13. HIDDEN 장소는 일반 서비스에 노출되지 않는다.
14. 삭제된 장소를 관리자가 조회할 수 있다.
15. 다중 Restore가 가능하다.
16. Restore 후 일반 서비스에서 정상 동작한다.
17. OWNER_INPUT Place도 검색/지도/상세/찜에서 정상 동작한다.
18. 일반 사용자는 Create/Hide/Restore/Admin 변경을 할 수 없다.
19. Rules/Index/Query-first 구조가 안전하게 유지된다.
20. 기존 기능 회귀가 없다.
21. Annie 독립 검증까지 PASS한다.

---

## 17. GitHub 기록

최종적으로 최소 다음 문서를 남긴다.

```text
PLACE_CRUD_OWNER_REQUEST_20261001.md
GENI_PLACE_CRUD_UNDERSTANDING_20261001.md
HANK_PLACE_CRUD_DESIGN_20261001.md
TODY_PLACE_CRUD_IMPLEMENTATION_20261001.md
ANY_PLACE_CRUD_VERIFICATION_20261001.md
FINAL_PLACE_CRUD_RESULT_20261001.md
```

그리고 실제 최종 상태에 맞게:

```text
STATE.md
DECISIONS.md
```

를 갱신한다.

Secret, credential, private key, 개인정보는 commit하지 않는다.

---

## 18. 이번 승인 범위

승인됨:

- 분석
- 설계
- 코드 구현
- local / Emulator 테스트
- Rules/Index 코드 수정
- 관련 MD 작성
- `feature/firestore-place-ui` commit/push
- FAIL 수정과 재검증 반복

승인되지 않음:

- upstream `bot052/DANGJEJU_2:main` merge
- PR #1 merge
- handoff branch 임의 변경
- Vercel 운영 변경
- Firebase Hosting 운영 배포
- GitHub Pages 운영 배포
- live Firestore 운영 데이터 대량 수정
- 새 Billing / 유료 Resource
- credential 공유

승인 범위를 넘어서는 경우에만 Owner에게 질문한다.

---

## 19. 실제 Agent 분리 실행 원칙

이번 작업은 Geni 한 Model이 Hank / Tody / Annie 역할을 흉내내는 방식으로 수행하지 않는다.

- Geni: CTO / 요구사항 관리 / 설계 승인 / 배정 / 최종 통합
- Hank: 실제 Codex Astra `gpt-6-astra` / 설계
- Tody: 실제 Codex Astra `gpt-6-astra` / 구현
- Annie: 실제 Gemini 계열 독립 검증 Agent / 테스트와 검증

각 결과 MD에는 다음을 남긴다.

- 실제 Agent
- 실제 Model
- 수행 범위
- 결과

---

## 20. 최종 완료 보고 형식

모든 작업이 끝난 뒤 Owner에게는 장문의 기술 설명 대신 다음 형식으로 간단히 보고한다.

```text
[댕제주 장소 DB 관리 기능 완료 보고]

최종 판정:
PASS / CONDITIONAL PASS / BLOCKED

Branch:
feature/firestore-place-ui

최종 Commit:
<SHA>

구현 완료:
- 신규 장소 등록
- 지역×업종 관리 조회
- 다중 선택
- 일괄 Soft Delete
- 삭제 장소 조회
- 일괄 Restore
- HIDDEN 일반화면 제외
- OWNER_INPUT Source 지원

Agent:
- Hank: <실제 model> / 설계
- Tody: <실제 model> / 구현
- Annie: <실제 model> / 독립검증
- Geni: 최종 통합

검증:
- lint:
- build:
- unit:
- Firestore Rules:
- Emulator:
- UI/E2E:
- 회귀:
- Annie 최종판정:

GitHub 결과 문서:
- <각 MD 파일 경로>

운영 환경 변경:
- 없음
또는 정확한 내용

남은 문제:
- 없음
또는 정확한 내용

Owner가 다음에 할 일:
- 한 줄로 명시
```

이 최종 보고는 Owner가 그대로 Toby에게 복사해 전달할 수 있도록 짧고 정확하게 작성한다.
