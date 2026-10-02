# 팀 Vercel 동기화 결과 보고서 — Firestore Read 절감 + 관리자 기능 동기화

## 1. 개요 및 전달 요약

- **대상 저장소**: `bot052/DANGJEJU_2` (Team repository)
- **Base 브랜치**: `main`
- **작업 브랜치**: `sync/firestore-read-and-admin-20261003` (Head: `tonykks:sync/firestore-read-and-admin-20261003`)
- **생성된 Pull Request**: https://github.com/bot052/DANGJEJU_2/pull/39
- **작업 Commit SHA**: `fa629dc80145c1109a15bc75cbbf9e55909241fc` (`fa629dc`)
- **실제 코드 수정 담당**: 토디 (Codex CLI + `gpt-6-astra`)
- **작업 관리 및 검토**: 지니

---

## 2. 반영된 수정 파일 목록 (9개 파일)

1. `src/App.tsx`: 상세 모달의 focus / visibilitychange 재조회 리스너 제거 (`PLACE_DATA_CHANGED` 초기화 리스너만 유지, 팀 UI 및 뱃지 완전 보존)
2. `src/hooks/usePlaceQueries.ts`: focus/visibilitychange 리스너 제거, QueryCache 메모리 캐싱 및 in-flight request deduplication 적용
3. `src/lib/firestoreQuota.ts`: 429 및 `RESOURCE_EXHAUSTED` / `Quota exceeded` 정규식 오류 감지 보완
4. `src/lib/adminPlaceEditor.ts`: 업체명 Prefix 30건 pagination, 4 page(120 read) 상한, 12건 조기 종료 로직 적용
5. `src/components/AdminPlaceCrud.tsx`: 조회 방식 전환(지역·업종 vs 업체명), 업체명 조회 시 중복 선택 버튼 숨김, 조건 변경 시 stale 상세 닫기
6. `src/components/AdminPlaceEditor.tsx`: `onClearEdit` 전달, `editGeneration` 티켓 기반 race condition 및 stale 상세 복원 차단
7. `tests/placeCrudRules.test.ts`: 이름 검색 기반 일괄 삭제/복원 규칙 및 트랜잭션 보존 테스트 케이스 추가
8. `tests/adminNameSearch.test.ts`: 업체명 Prefix 검색, pagination, UI 닫기 및 버튼 가시성 회귀 검증 테스트 추가 (19개)
9. `tests/usePlaceQueriesCache.test.ts`: 동일 Query 캐시 재사용, deduplication, 탭 복귀 시 재조회 차단 검증 테스트 추가 (15개)

---

## 3. 핵심 이식 내용

### 3.1 Firestore Read 절감 (팀 UX 100% 보존)
- **이벤트 리스너 제거**: `window focus` 및 `document visibilitychange` 시점에 자동으로 Firestore Query를 재호출하던 로직을 완전 제거하여 백그라운드 탭 복귀 시 불필요한 과다 조회를 방지.
- **인메모리 캐시 및 중복 호출 제거**:
  - `publicQueries` 맵을 통해 동일 Hero/Search 요청의 pending promise를 공유하여 in-flight deduplication 수행.
  - 검색 결과 캐시를 유지하여 동일 지역/조건 재방문 시 Firestore read 없이 즉시 렌더링.
- **상세 모달 보호**: 상세 모달 오픈 상태에서 다른 탭을 오가더라도 추가 read가 발생하지 않도록 차단.
- **데이터 변경 감지 유지**: `PLACE_DATA_CHANGED` 커스텀 이벤트가 발행될 때만 안전하게 캐시를 비우고 최신 데이터를 다시 읽도록 유지.
- **팀 검색 구조 유지**: 팀의 기존 `usePlaceSearch(selectedRegion, 'all', !isAdminRoute)` 방식 및 클라이언트 사이드 카테고리 필터링 구조를 일체 변경하지 않고 내부 쿼리 캐시 계층만 투명하게 개선.

### 3.2 관리자 기능 동기화
- **업체명 Prefix 검색**:
  - 기존 지역·업종 조회 외에 업체명 앞부분으로 검색할 수 있는 조회 모드 추가.
  - 단순 타이핑에 의한 자동 쿼리를 엄격히 금지하고, '조회' 버튼 클릭 또는 'Enter' 입력 시에만 실행.
  - 상태 필터링 시 30건씩 최대 4페이지(120 read) 범위 내에서 안전하게 pagination하며, 12건이 모이면 즉시 early exit.
- **UI 정리 및 Stale 상태 방지**:
  - 업체명 조회 모드에서는 혼란을 주는 `현재 조건 전체 선택` 버튼을 숨기고 `현재 표시된 항목 선택`만 노출.
  - 조회 방식 전환, 상태(정상/삭제) 전환, 지역/업종 변경, 신규 검색 실행, 0건 결과, 일괄 삭제/복원 완료 시 열려 있던 기존 업체 상세 편집기를 자동으로 닫아 잘못된 수정 방지.
  - 비동기 로딩 지연 중 조건이 변경된 경우 이전 장소 정보가 뒤늦게 화면을 덮어쓰지 않도록 generation ticket 검증 적용.

---

## 4. 검증 결과

- **TypeScript Typecheck (`npm run lint` / `tsc --noEmit`)**: PASS (오류 0건)
- **Production Build (`npm run build` / `vite build`)**: PASS (빌드 완료)
- **신규/수정 테스트 스위트**:
  - `tests/usePlaceQueriesCache.test.ts`: 15 passed, 0 failed
  - `tests/adminNameSearch.test.ts`: 19 passed, 0 failed
  - `tests/placeCrudRules.test.ts`: 1 passed, 0 failed (이름 필터링 삭제/복원 규칙)
- **전체 단위 테스트**: 110 passed, 0 regressions

---

## 5. 팀 merge 전 확인 및 주의사항

1. **merge 권한 및 절차**:
   - `bot052/DANGJEJU_2:main`에 직접 push하지 않았으며, PR #39를 통해 전달되었습니다.
   - 팀 리드/담당자가 PR 검토 후 `bot052/DANGJEJU_2`에서 머지를 진행합니다.
2. **배포 환경**:
   - Vercel 설정을 직접 수정하지 않았습니다.
   - PR 머지 시 Vercel에서 `main` 브랜치를 기반으로 자동 배포가 트리거될 예정입니다.
3. **Firestore 규칙 및 인덱스**:
   - 새 복합 인덱스나 보안 규칙 확장이 필요하지 않도록 설계되었습니다.
