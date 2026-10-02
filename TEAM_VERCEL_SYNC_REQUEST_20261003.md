# 팀 Vercel 동기화 요청 — Firestore Read 절감 + 승인된 관리자 보완

## 목적

팀 운영 Vercel은 `bot052/DANGJEJU_2`의 `main`을 사용하고 있으며 현재도 Owner의 Firebase project `dangjeju`를 함께 사용한다.

Owner GitHub Pages에서는 아래 문제가 수정·배포·브라우저 검증까지 완료되었다.

1. 브라우저 focus / visibilitychange 시 Firestore 재조회 반복
2. 동일 Query의 불필요한 반복 Read
3. 상세 모달의 탭 복귀 재조회
4. Quota 오류 감지 범위 부족
5. 관리자 삭제/복원에서 업체명 Prefix 조회 추가
6. 업체명 조회의 중복 선택 버튼 제거
7. 조회 조건 변경 뒤 이전 업체 상세정보가 남는 UI 상태 문제

이번 작업은 위 승인된 수정 중 팀 `main`에 필요한 내용을 **선택적으로 이식**하여 Vercel에서도 동일한 안정성을 확보하는 것이다.

---

## 작업 대상

- Team repository: `bot052/DANGJEJU_2`
- Base branch: `main`
- 작업은 별도 branch에서 수행하고 최종적으로 PR을 `main`으로 생성한다.
- Owner repository의 승인된 기준 branch:
  - `tonykks/DANGJEJU_2:feature/firestore-place-ui`

---

## 1. Firestore Read 절감 — 필수

팀 `main`의 현재 코드에는 아직 다음 자동 재조회가 남아 있다.

- `src/hooks/usePlaceQueries.ts`
  - `window focus`
  - `document visibilitychange`
- `src/App.tsx`
  - 상세 모달의 focus / visibilitychange 재조회

Owner branch에서 검증 완료된 원칙을 팀 코드에 맞게 이식한다.

### 필수 동작

- focus만으로 Firestore Query 재실행 금지
- visibilitychange만으로 Firestore Query 재실행 금지
- `PLACE_DATA_CHANGED`에서는 필요한 Cache 무효화 및 갱신 유지
- 동일 Hero/Search/Favorites Query의 메모리 Cache 재사용
- 동일 조건 In-flight Query deduplication
- 상세 모달은 탭 복귀만으로 다시 Firestore를 읽지 않음
- 명시 Retry는 정상 동작
- 429 / RESOURCE_EXHAUSTED quota 감지 및 기존 60초 cooldown 유지

### 매우 중요

팀 `main`의 현재 사용자 UX는 유지한다.

특히 현재 팀 코드는:
- 지역 선택 시 지역 전체를 읽음
- 이후 category는 client-side filtering
- list / map / category count가 같은 region result를 공유

이번 PR에서는 이 UX와 검색 의미를 바꾸지 않는다.
새 Firestore index 설계나 검색 구조 전면 개편을 하지 않는다.

즉 Owner의 `App.tsx` 전체를 단순 복사하지 말고,
**Read 절감 로직만 팀 현재 구조에 맞게 선택적으로 이식**한다.

---

## 2. 승인된 관리자 기능 동기화

Owner branch에서 브라우저 검증까지 완료된 다음 관리자 기능을 팀 코드에도 반영한다.

### 업체명 조회 기반 삭제/복원

기존 지역·업종 조회는 유지하면서 같은 삭제 관리 화면에 업체명 조회를 제공한다.

- Prefix Search
- 조회 버튼 또는 Enter 시에만 Query
- typing마다 Query 금지
- 정상 장소 / 삭제된 장소 분리
- 최대 결과 12건
- 상태 필터가 필요한 경우 30건 단위 pagination
- 최대 4 page / 120 read 상한
- 12건 확보 시 Early Exit
- 기존 batch 삭제/복원 로직 재사용
- 전체 collection scan 금지

### UI 보완

- 업체명 조회 모드에서는 `현재 조건 전체 선택` 숨김
- `현재 표시된 항목 선택`만 유지
- 지역·업종 조회에서는 기존 두 선택 버튼 유지
- 정상/삭제 상태 전환 시 이전 상세정보 닫기
- 조회 방식 전환 시 이전 상세정보 닫기
- 지역/업종 변경 시 이전 상세정보 닫기
- 새 업체명 검색/0건 결과/삭제·복원 완료 시 이전 상세정보 닫기
- 현재 목록 업체를 직접 클릭하면 상세 수정 화면 정상 오픈

---

## 3. 변경하지 말아야 할 것

- 팀이 이후 반영한 UI/레이아웃/검색 동작을 Owner 파일로 덮어쓰지 않는다.
- Firebase project 변경 금지
- Firestore Rules / Indexes 변경은 필요 근거가 없으면 금지
- Production에서 32개 조합 반복 조회 등 대량 smoke test 금지
- Vercel 설정 직접 변경 금지
- team `main` 직접 push 금지
- unrelated refactor 금지

---

## 4. 검증

최소 다음을 확인한다.

- focus / visibilitychange 반복 시 동일 Firestore Query 추가 실행 없음
- 팀의 region-only UX 유지
- list / map / category count 정상
- 상세 모달 정상
- favorites 정상
- 관리자 지역·업종 삭제/복원 정상
- 관리자 업체명 Prefix 조회 정상
- 업체명 검색 결과 선택 삭제/복원 정상
- 업체명 조회 중복 버튼 제거
- 조회조건 전환 시 stale 상세정보 제거
- `npm run lint` PASS
- `npm run build` PASS
- 관련 unit/regression test PASS
- Production 대량 read 테스트 없음

---

## 5. 전달 방식

- 별도 branch 생성
- 검증 완료 후 `bot052/DANGJEJU_2:main` 대상 PR 생성
- PR에는 변경 목적, 핵심 파일, 테스트 결과를 간단히 적는다.
- merge는 팀 담당자가 수행한다.
- Owner 쪽 `main` 또는 Vercel을 직접 변경하지 않는다.

## 6. 결과 기록

작업 완료 후 Owner repository의 현재 작업 branch에 기술 결과를
`TEAM_VERCEL_SYNC_RESULT_20261003.md`
로 기록한다.

결과 파일에는 다음을 포함한다.

- Team 작업 branch
- PR 링크
- 수정 파일
- Read 절감 이식 내용
- 관리자 기능 동기화 내용
- 테스트/lint/build 결과
- merge 전 남은 확인사항
