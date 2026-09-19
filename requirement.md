# requirement.md — DANGJEJU 관리자 데이터 수정 V1 요구사항

> 작업 대상 Repository: `tonykks/DANGJEJU_2`  
> 작업 Branch: `feature/firestore-place-ui`  
> Entry Point: `agent-collab-kit/README.md`  
> 이 문서는 이번 작업의 요구사항 기준이다. 구현자는 먼저 원격 최신 상태로 sync한 뒤 이 문서와 `PROJECT_INTENT.md`, `STATE.md`, `DECISIONS.md`를 읽고 현재 정상 기능을 보존한다.

---

## 1. 작업 목적

현재 댕제주는 Google 로그인/로그아웃, 사용자별 찜, Firestore 장소검색, 지도/목록/상세보기, Firebase Hosting 및 GitHub Pages 배포까지 정상 동작한다.

다음 단계의 목적은 **담당자만 접근할 수 있는 관리자 데이터 수정 페이지**를 만들어, 장소정보가 누락되거나 잘못된 경우 개발자에게 코드 수정을 요청하지 않고 웹 화면에서 직접 보완할 수 있게 하는 것이다.

이번 V1은 향후 "자동 데이터 수집 Agent → 후보값 제시 → 관리자 승인 → 동일 저장 경로로 DB 반영" 기능의 기반이 되어야 한다.

---

## 2. 학습 목적

이번 구현을 통해 다음 개념을 실제 서비스 구조 안에서 경험하는 것을 목표로 한다.

- 일반 사용자와 관리자 권한 분리
- Firebase Authentication 사용자 UID 기반 권한 판별
- Firestore Security Rules를 이용한 실제 쓰기 권한 보호
- Firestore 데이터의 부분 수정(update)
- 기존 데이터와 관리자 보완 데이터의 우선순위
- 사용자 입력 Validation
- 내부 파생값 자동 재계산
- 동일 관리 UI를 향후 Agent 자동수집 승인 화면으로 확장하는 구조

---

## 3. 현재 정상 기능 — 회귀 금지

다음 기능은 이미 정상 동작 중이며 이번 작업 때문에 깨지면 안 된다.

1. Firebase Authentication Google 로그인/로그아웃
2. 사용자별 찜 저장/삭제/재로그인 복원
3. `users/{uid}/favorites/{placeId}` 구조
4. Firestore Query-first 장소 검색
5. 홈 대표 최대 5개
6. 지역 4 × 장소유형 8 검색
7. Map/목록 동일 결과 배열
8. 상세 팝업 및 첫 탭 초기화
9. KTO Pet UNKNOWN 포함 및 확인 데이터 우선 정렬
10. Firebase Hosting `https://dangjeju.web.app`
11. GitHub Pages `https://tonykks.github.io/DANGJEJU_2/`
12. Pages 전용 base `/DANGJEJU_2/`
13. 기존 KTO Source 원본 및 provenance
14. 기존 favorites 데이터

**정상 기능을 불필요하게 수정하지 않는다.** 불가피한 변경은 최소 범위로 하고 완료 보고에서 수정 파일/로직/이유/기존 기능 영향을 명시한다.

---

## 4. 관리자 권한 요구사항

### 4.1 기본 원칙

관리 페이지 주소를 숨기는 것만으로 보안을 구현하지 않는다.

반드시 다음 두 단계가 모두 적용되어야 한다.

1. **UI 권한:** 관리자에게만 `관리` 버튼이 표시된다.
2. **DB 권한:** URL을 직접 알아도 관리자 이외의 사용자는 Firestore 장소 데이터를 수정할 수 없다.

### 4.2 관리자 판별

V1 기본 구조는 다음을 사용한다.

```text
admins/{uid}
  role: "admin"
  active: true
```

- Google 로그인 후 Firebase Auth의 `uid`로 관리자 여부를 확인한다.
- 일반 사용자의 이메일 주소를 코드에 하드코딩하지 않는다.
- 관리자 UID도 source code 또는 Public Git에 하드코딩하지 않는다.
- `admins/{uid}` 문서의 쓰기는 일반 Client에서 금지한다.
- Client는 자기 UID에 해당하는 관리자 상태만 필요한 범위에서 읽을 수 있게 한다.
- 초기 관리자 지정은 별도의 안전한 1회 절차로 수행한다. 구현자가 임의의 계정/UID를 추측해서 등록하지 않는다.

### 4.3 접근 동작

- 비로그인 사용자: 관리 버튼 없음, 관리자 화면 접근 불가.
- 로그인 일반 사용자: 관리 버튼 없음, 관리자 URL 직접 접근 시 거부/홈 복귀.
- 활성 관리자: Header 사용자 영역에 `관리` 버튼 표시.
- 관리자 버튼을 누르면 관리자 데이터 수정 페이지로 이동.
- Firebase Hosting과 GitHub Pages 양쪽에서 동일하게 동작해야 한다.
- 현재 Router가 없으면 과도한 새 의존성을 추가하지 말고 두 배포환경에서 가장 단순하고 안정적인 방식으로 구현한다.

---

## 5. 관리자 데이터 수정 페이지 UX

### 5.1 기본 흐름

```text
업체명 검색
  ↓
업체 선택
  ↓
현재 웹에 표시되는 장소정보 전체 표시
  ↓
수정할 항목 여러 개 체크
  ↓
체크한 항목만 입력창 활성화/표시
  ↓
여러 항목 한 번에 입력
  ↓
변경 전/후 확인
  ↓
저장
  ↓
선택한 Field만 Firestore 반영
  ↓
필요한 내부 파생값 자동 재계산
  ↓
완료
```

### 5.2 업체 검색

- 장소명으로 검색할 수 있어야 한다.
- 같은 이름이 여러 건일 수 있으므로 `placeId`, 주소, 장소유형 등으로 구분 가능하게 보여준다.
- 전체 2,126개 Catalog를 Client에 선로딩해서 검색하는 방식은 금지한다.
- 기존 Query-first 원칙을 유지한다.
- V1에서는 정확검색/접두검색 등 Firestore에서 안전하게 구현 가능한 방법을 우선한다.
- 필요한 경우 최소한의 검색용 파생필드를 추가할 수 있으나, 전체 Catalog 선로딩으로 돌아가지 않는다.

### 5.3 표시 대상 Field

**현재 실제 사용자 화면에서 장소정보로 표시되는 Field 전체를 기준으로 한다.**

구현자는 다음 Component/Type을 실제로 inventory하여 최종 목록을 확정한다.

- `src/types.ts`
- `PlaceCard`
- `PlaceListItem`
- `PlaceDetailModal`
- `JejuMap`의 장소 표시
- `src/lib/placeAdapter.ts`

대표적으로 다음 정보가 포함된다.

- 장소명
- 서비스 장소유형/Category
- 지역/권역에 영향을 주는 주소 정보
- 한 줄 설명
- 상세 설명
- 주소 / 도로명 주소
- 좌표
- 전화번호
- 대표 이미지 / 보조 이미지
- 주차정보
- 운영시간
- 휴무일
- Instagram/SNS
- Tags
- Pet 관련 사용자 표시정보
- Amenities 중 실제 화면 표시 항목
- 추천 포인트 / 주의사항 등 실제 장소 상세화면 표시정보

**Event/Banner처럼 장소 Entity와 별개인 데이터는 이번 V1 장소 수정 범위에서 제외한다.**

### 5.4 내부 Field

다음과 같은 시스템 내부값은 관리자 화면에 수정 Field로 노출하지 않는다.

- `placeId`
- `search.*`
- `totalScore`
- `petSortKey`
- score/version/hash
- createdAt/importedAt 등 시스템 시각
- sourceId / provenance 내부키
- 기타 검색/검증용 내부 Field

관리자가 사용자에게 보이는 장소정보를 수정하면 필요한 내부 파생값은 프로그램이 자동으로 처리한다.

---

## 6. 데이터 수정 원칙

### 6.1 모든 사용자 표시 장소정보는 수정 가능

담당자는 사용자에게 실제 표시되는 장소정보를 세심하게 보완할 수 있어야 한다.

- 업체명부터 이미지, 주소, 전화번호, 운영시간, 설명, Pet 정보 등 사용자 표시정보는 수정 대상이다.
- 여러 Field를 동시에 선택하고 한 번의 저장으로 반영할 수 있어야 한다.
- 체크하지 않은 Field는 절대로 변경하지 않는다.
- 빈 값으로 지우는 기능이 필요하면 명시적 `값 지우기` 동작으로 구분하여 실수로 삭제되지 않게 한다.

### 6.2 KTO 원본 보존

- `places/{placeId}/sources/{sourceId}`의 KTO Source 원문은 관리자 화면에서 직접 덮어쓰지 않는다.
- 현재 UI 값이 KTO Source에서만 오는 Field라면, KTO 원문을 수정하지 않고 **서비스용 관리자 override**를 추가하는 최소 구조를 사용한다.
- 최종 표시 우선순위는 구현 후 문서화한다.
- 기본 원칙은 **관리자가 확인한 서비스값 > 기존 서비스값 > KTO Source fallback > placeholder**이다.
- 관리자 입력값의 출처가 Owner/Admin 수동입력임을 내부적으로 추적할 수 있어야 한다. 단, 이 관리 metadata는 일반 수정 UI에 노출할 필요가 없다.

### 6.3 검색 파생값

사용자 표시정보 수정으로 `search.*`의 점수/정렬 결과가 달라질 수 있으면 저장 과정에서 자동 재계산한다.

- 관리자가 `search.totalScore`, `petSortKey` 등을 직접 입력하지 않는다.
- 기존 `tools/firestore_place_search_fields/`의 deterministic 계산 기준을 우선 재사용한다.
- Client 구현을 위해 계산 로직을 TypeScript로 옮길 필요가 있다면 기존 Python 기준과 결과가 일치하는 회귀 테스트를 추가한다.
- 가능하면 수정된 1개 Place만 재계산하고 전체 2,126개를 매번 다시 쓰지 않는다.

---

## 7. 이미지 입력 요구사항

이미지 Field는 최소한 다음을 지원한다.

### 필수 V1
- 이미지 URL 직접 입력
- 저장 전 URL 형식 Validation
- 변경 전/후 이미지 미리보기
- 잘못된 이미지 또는 로드 실패 시 기존 placeholder fallback 유지

### 파일 업로드
- 현재 Firebase Storage가 이미 안전하게 사용 가능한지 먼저 확인한다.
- 새 Billing, 새 유료 Resource, 새 계정 또는 보안상 중요한 설정이 필요한 경우 임의로 생성/결제/활성화하지 말고 Owner에게 결정 요청한다.
- 추가 비용/중요 설정 없이 안전하게 가능한 경우에만 파일 업로드를 V1에 포함한다.
- 그렇지 않으면 URL 입력을 V1 완료조건으로 하고 파일 업로드는 후속 항목으로 기록한다.

---

## 8. Validation / 안전장치

저장 전에 Field 종류에 맞게 검증한다.

- URL: http/https 유효성
- 좌표: 숫자 및 제주 범위 검증
- 전화번호: 문자열로 보존하되 공백/명백한 오류 검토
- Tags: 중복/빈값 정리
- Boolean/Unknown 성격 Field: `false`와 `unknown` 혼동 금지
- 숫자/금액 Field: 타입 검증
- 저장 전 변경 Field 목록과 현재값 → 새값을 관리자에게 보여준다.
- 한 번의 저장은 선택 Field만 변경한다.
- 실패 시 어떤 Field가 저장되지 않았는지 알 수 있어야 한다.

---

## 9. Firestore Security Rules

현재 `places/{placeId}`는 public read / write false 상태이다.

이번 구현에서는 관리자 수정이 가능하도록 Rules를 설계하되 다음을 지킨다.

- public read는 기존과 동일하게 유지.
- 일반 로그인 사용자는 Place write 불가.
- 활성 관리자만 Place update 가능.
- Place create/delete는 이번 V1에서 허용하지 않는다.
- KTO `sources` write는 계속 금지.
- 관리자 상태 collection의 Client write 금지.
- 가능하면 Rules 수준에서도 수정 가능한 top-level 서비스 Field를 allowlist하여 `search`, id, provenance 등의 내부값을 사람이 임의 수정하지 못하도록 보호한다.
- 앱이 자동으로 갱신해야 하는 파생값이 Rules allowlist에 포함되어야 한다면 UI에서 노출하지 않고 코드가 자동 계산한다.
- Favorites 기존 Rules는 변경하지 않는다.

---

## 10. 향후 자동 데이터 수집 Agent와의 연결

**자동 수집 기능 자체는 이번 V1 구현 범위에서 제외한다.**

하지만 이번 관리자 페이지와 저장 로직은 다음 단계에서 그대로 재사용 가능해야 한다.

향후 흐름:

```text
Agent 정기 실행
  ↓
공공데이터/KTO/공식 업체 웹페이지에서 후보 수집
  ↓
현재 DB와 비교
  ↓
후보값 + 출처 + 확인일 제시
  ↓
관리 페이지에 자동으로 입력칸 prefill
  ↓
담당자 체크/승인
  ↓
이번 V1과 동일한 저장 로직
```

따라서 수동 입력과 자동 후보 승인용 저장 경로를 중복 구현하지 않는다.

---

## 11. 개발 역할 / Agent 사용

이번 작업은 Cursor Native Geni를 사용하지 않는다.

### 총괄
- **Codex 확장 채팅의 행크(Hank)**가 작업 총괄, 계획, 통합, 완료 보고를 담당한다.

### CLI 2개 사용
행크는 다음 두 CLI를 실제 작업에 활용한다.

1. **Codex CLI**
   - 코드 분석/구현/테스트의 주 작업자
   - 현재 저장소 규칙과 requirement.md를 기준으로 최소 변경 구현

2. **agy CLI (Ani / Gemini 계열)**
   - Codex CLI 구현과 독립된 Review/테스트 담당
   - 관리자 권한 우회, Firestore Rules, 기존 기능 회귀, 두 배포환경 경로를 중점 검증

가능한 한 구현자와 검토자를 분리한다.

CLI 호출이 실패하거나 사용할 수 없으면 다른 Provider로 임의 대체하지 말고 STATE에 정확히 기록하고 보고한다.

---

## 12. 구현 순서

1. `agent-collab-kit/README.md`부터 Reading Protocol 수행
2. 원격 최신 `feature/firestore-place-ui` sync
3. `requirement.md`, PROJECT_INTENT, STATE, DECISIONS 확인
4. 현재 사용자 표시 Place Field inventory
5. 관리자 권한/Rules/데이터 override 최소 설계
6. Codex CLI 구현
7. unit/lint/build/가능한 emulator 검증
8. agy CLI 독립 Review 및 수정 필요사항 확인
9. 필요한 수정
10. 재시험
11. GitHub Pages 경로/base 회귀 확인
12. STATE/필요 시 DECISIONS 갱신
13. feature branch commit/push
14. 완료 보고 후 중단

---

## 13. 이번 단계에서 하지 않는 것

- 자동 웹검색/공공데이터 수집 Agent 구현
- Scheduler/정기 실행
- Event/Banner 관리
- 새 장소 생성/삭제
- KTO Source 원문 수정
- 전체 Catalog 선로딩 복원
- PR 생성
- main merge
- 기존 Firebase Hosting 재배포
- Owner 승인 없는 Firestore Rules live deploy
- Owner 승인 없는 Firebase Storage/Billing 활성화
- Owner 승인 없는 운영 DB 관리자 계정 생성/변경

GitHub Pages는 현재 feature branch push 시 자동 배포될 수 있으므로 그 사실을 완료 보고에 명시한다.

---

## 14. 시험 및 Acceptance 조건

### 권한
- [ ] 비로그인 사용자는 관리 버튼을 볼 수 없다.
- [ ] 일반 로그인 사용자는 관리 버튼을 볼 수 없다.
- [ ] 관리자만 관리 버튼을 볼 수 있다.
- [ ] 일반 사용자가 관리자 URL을 직접 입력해도 수정 화면/DB write가 허용되지 않는다.
- [ ] 관리자만 Place update가 가능하다.
- [ ] KTO Source write는 계속 거부된다.

### 관리 UI
- [ ] 업체명 검색이 전체 Catalog 선로딩 없이 동작한다.
- [ ] 동명 장소를 구분할 수 있다.
- [ ] 선택 장소의 현재 사용자 표시정보 전체를 한 화면에서 확인할 수 있다.
- [ ] 여러 Field를 체크할 수 있다.
- [ ] 체크한 Field만 편집 가능하다.
- [ ] 여러 Field를 한 번에 저장할 수 있다.
- [ ] 체크하지 않은 Field는 바뀌지 않는다.
- [ ] 저장 전 변경 전/후를 확인할 수 있다.
- [ ] 이미지 URL 입력/미리보기가 동작한다.
- [ ] 내부값은 수정 UI에 노출되지 않는다.

### 데이터/검색
- [ ] KTO Source 원문은 보존된다.
- [ ] 관리자 보완값이 사용자 화면에 우선 반영된다.
- [ ] 필요한 search 파생값은 자동 재계산된다.
- [ ] 한 장소 수정 때문에 전체 Catalog write가 발생하지 않는다.

### 회귀
- [ ] Google 로그인/로그아웃 정상
- [ ] 사용자별 찜 정상
- [ ] 대표 5곳 정상
- [ ] 4×8 검색 정상
- [ ] Map/목록/상세 정상
- [ ] Firebase Hosting 기존 서비스 자산/동작에 의도하지 않은 변경 없음
- [ ] GitHub Pages base 경로 정상
- [ ] lint PASS
- [ ] 관련 unit/integration test PASS
- [ ] agy 독립 Review 결과 PASS 또는 잔여사항이 명확히 기록됨

---

## 15. Live 적용 경계

이번 Codex 작업의 기본 완료점은 **코드 구현 + 테스트 + 독립 Review + feature branch push**이다.

Firestore Rules의 실제 live 배포, 초기 관리자 등록, Firebase Storage 신규 설정 등 운영 상태를 바꾸는 작업은 결과를 Toby/Owner가 검토한 뒤 별도 승인으로 진행한다.

따라서 구현 완료 보고는 "코드 완료"와 "운영 적용 완료"를 혼동하지 않는다.

---

## 16. 완료 보고 형식

행크는 최종적으로 다음만 간결하게 보고한다.

1. 구현 완료 여부
2. Codex CLI 사용 결과
3. agy CLI Review 판정
4. 변경 파일 목록
5. 관리자 권한 구조
6. 수정 가능한 사용자 표시 Field 범위
7. KTO Source 보존 방식
8. search 자동 재계산 방식
9. 테스트 결과
10. GitHub Pages 자동 배포 여부/결과
11. 아직 live 적용하지 않은 항목
12. Owner/Toby가 다음에 승인해야 할 항목
13. 최종 commit SHA

완료 후 `STATE.md`를 최신 상태로 갱신하고 commit/push한 뒤 중단한다.
