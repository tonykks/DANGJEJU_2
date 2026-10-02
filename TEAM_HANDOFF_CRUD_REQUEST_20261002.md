# TEAM HANDOFF CRUD REQUEST — 2026-10-02

> Repository (Owner fork): `tonykks/DANGJEJU_2`  
> Source branch: `feature/firestore-place-ui`  
> Source tip confirmed by Toby: `d67009cd41530d87f1a11d5ca5ecd4c816dfe984`  
> Team repository: `bot052/DANGJEJU_2`  
> Team main tip confirmed by Toby: `1df0d815b8800937a0b5708f25169668f18b69db`  
> Goal: 내일 제출 전, Owner가 완성한 최신 Place CRUD + Admin UI 개선분을 팀 저장소에 안전하게 인계하고 Vercel 배포까지 팀이 이어받을 수 있는 상태로 만든다.

---

## 1. 현재 상황

- 기존 PR #1은 이미 팀 저장소에 merge 완료되었다.
- 그 이후 Owner fork에서 다음 추가 작업이 완료되었다.
  - 신규 장소 등록
  - `OWNER_INPUT` Source
  - `owner-<uuid v4>` ID
  - 지역 4 × 업종 8 관리자 조회
  - 다중 선택
  - Soft Delete (`publicationStatus = HIDDEN`)
  - Restore
  - 삭제 직전 `publicationStatus` 복원
  - HIDDEN 공개 화면 제외
  - Firestore Rules / Indexes 확장
  - 신규 등록 상단 sticky `등록 내용 확인`
  - 정상 장소 / 삭제된 장소 선택 상태 색상 구분
  - 일반 버튼 hover / active 시각 효과
- Owner Firebase `dangjeju`에는 최신 Rules/Indexes가 이미 운영 반영되어 있다.
- 팀 Vercel은 현재 임시로 Owner Firebase Web Config를 사용 중이다.
- 팀 저장소에는 별도의 open PR #11 `Fix region-only Firestore search`가 존재하므로, 이를 임의로 닫거나 merge하거나 덮어쓰지 않는다.

---

## 2. 인계 원칙

### 반드시 지킬 것

1. 팀 최신 `bot052/DANGJEJU_2:main`을 기준으로 새 handoff branch를 만든다.
2. Owner의 `feature/firestore-place-ui` 전체 branch를 강제로 덮어쓰거나 force merge하지 않는다.
3. 팀 main에서 PR #1 이후 추가된 신주영님 측 변경을 보존한다.
4. 이번 CRUD/UI 추가분만 선별 통합한다.
5. 충돌이 있으면 팀 main의 최신 기능을 기준으로 수동 통합한다.
6. 내부 협업 문서, Owner 전용 기록, 테스트용 private 자료는 팀 PR에 불필요하게 포함하지 않는다.
7. 제품 코드 + Rules + Indexes + 필요한 tests만 전달한다.
8. PR 생성까지만 수행하고 팀 main merge는 하지 않는다.
9. 기존 open PR #11은 별도 작업으로 유지한다.

---

## 3. 새 handoff branch

권장 이름:

```text
handoff/place-crud-20261002
```

반드시 최신 `bot052/DANGJEJU_2:main`에서 시작한다.

---

## 4. 이번에 인계할 기능

### Place CRUD

- 신규 장소 등록
- 필수 입력 최소 3개:
  - 장소명
  - 검색 권역
  - 서비스 장소유형
- 내부 ID 자동 생성
- `OWNER_INPUT` provenance
- 기존 KTO Source immutable 유지
- 지역 × 업종 관리자 조회
- 100건 페이지네이션
- 다중 선택
- 일괄 Soft Delete
- 삭제된 장소 조회
- 일괄 Restore
- `publicationStatus` 기존 enum 재사용
- 신규 `deleted` boolean 금지
- `manualAdmin.previousPublicationStatus`로 원상 복원
- HIDDEN 장소의 일반 사용자 화면 노출 차단
- Favorites 문서 자체는 삭제하지 않음

### Admin UI 개선

- 신규 장소 등록 상단 sticky `등록 내용 확인`
- 기존 하단 버튼 유지
- 정상 장소 / 삭제된 장소 Toggle 선택 상태 시각 구분
- 일반 실행 버튼 hover / active 상태 표시
- 기존 CRUD 동작 로직은 변경하지 않음

### Firestore

- 최신 `firestore.rules`
- 최신 `firestore.indexes.json`
- KTO Source write 차단
- 일반 사용자 Place CUD 차단
- active admin만 Owner Input Create / Hide / Restore 허용
- physical delete 차단
- Query-first 유지

---

## 5. 팀 main 변경 보존

현재 팀 main에는 PR #1 이후의 팀 변경이 추가되어 있다.

Geni는 다음 원칙으로 통합한다.

- 팀 최신 `App.tsx`, Map, Card, Detail, Search, TourAPI 관련 변경을 먼저 파악한다.
- Owner CRUD가 필요로 하는 변경만 해당 최신 구조에 맞춰 포팅한다.
- 팀의 최근 KTO required pet items mapping 변경을 되돌리지 않는다.
- PR #11의 region-only search 수정과 충돌 가능성이 있으면 현황만 보고하고, PR #11 자체를 조작하지 않는다.
- `firestore.indexes.json`은 팀 최신 인덱스와 Owner CRUD 인덱스를 **합집합**으로 보존해야 한다. 기존 팀 인덱스를 삭제하지 않는다.

---

## 6. 검증

통합 후 최소 다음을 수행한다.

```text
npm run lint
npm run build
```

그리고 관련 테스트:

- Place CRUD unit tests
- Admin UI tests
- Firestore Rules tests
- 기존 팀 search / KTO 관련 tests
- 가능한 전체 Node test suite
- Python search derivation parity가 현재 팀 구조에 존재하면 해당 회귀 테스트

반드시 확인:

- 기존 팀 Home / 검색 / 지도 / 상세 기능 회귀 없음
- Google 로그인 코드 보존
- Favorites 보존
- 신규 장소 등록
- 지역×업종 관리자 조회
- Soft Delete / Restore
- HIDDEN public exclusion
- KTO Source immutable
- 최신 버튼 UX

---

## 7. Firebase / Vercel 주의

현재 신주영님 Vercel은 임시로 Owner Firebase `dangjeju`를 사용할 수 있다.

이번 PR에서는:
- Firebase 프로젝트를 새로 만들지 않는다.
- Owner Firebase 운영 데이터를 수정하지 않는다.
- Vercel Production을 Geni가 임의로 재배포하지 않는다.
- Secret / Web Config 값을 PR 본문이나 commit에 노출하지 않는다.

PR merge 후 팀 Vercel 자동 배포가 실행되는 경우, 신주영님이 배포 결과를 확인한다.

최종적으로는 신주영님이 자신의 Firebase 프로젝트로 분리하는 것이 목표지만, **내일 과제 제출 전 우선순위는 팀 최신 코드에 CRUD/UI 기능을 정확히 인계하고 Vercel에서 정상 실행 가능한 상태를 만드는 것**이다.

---

## 8. PR 작성

PR 대상:

```text
base: bot052/DANGJEJU_2:main
head: tonykks:DANGJEJU_2 / 새 handoff branch
```

PR 제목 예:

```text
feat: hand off place CRUD and admin management enhancements
```

PR 본문에는 최소 다음을 포함한다.

- 기존 PR #1 이후 추가 인계분임
- 신규 장소 등록
- OWNER_INPUT
- 지역×업종 관리
- Soft Delete / Restore
- HIDDEN 공개 제외
- Rules / Indexes 변경
- Admin UI UX 개선
- 충돌 처리 여부
- 테스트 결과
- 팀 Vercel은 현재 Firebase 설정을 별도로 확인해야 함
- merge는 팀 Owner 판단 사항

---

## 9. 완료 보고 형식

작업이 끝나면 Owner에게 아래만 간단히 보고한다.

```text
[댕제주 팀 인계 PR 완료]

handoff branch:
<branch>

PR:
<#번호 / 링크>

팀 main 기준:
<SHA>

충돌:
없음 / 있음 및 해결 요약

테스트:
- lint:
- build:
- CRUD:
- Rules:
- 기존 팀 회귀:

Vercel:
PR 생성까지만 완료 / Preview 상태가 있으면 상태

남은 일:
신주영님 merge 및 Vercel 확인
```

