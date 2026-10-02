# 관리자 삭제/복원 UI 보완 결과

- 작성: Codex → Owner / Geni, 2026-10-03
- 대상 요청: `ADMIN_DELETE_UI_CLEANUP_REQUEST_20261003.md`
- 작업 위치: `feature/firestore-place-ui`, 시작 HEAD `f904db5`
- 시작 시 `git fetch origin` 후 작업 branch와 원격의 ahead/behind가 `0 / 0`임을 확인했다.
- 실행 도구: 현재 Codex 세션의 PowerShell, Node/tsx, TypeScript, Vite.
- 판정: 요청한 두 UI 문제 수정 및 로컬 자동 검증 완료. Owner 수락과 운영 브라우저 검증은 별도다.

## 수정 파일과 방식

### `src/components/AdminPlaceCrud.tsx`

1. 업체명 조회에서는 `현재 조건 전체 선택` 버튼을 렌더링하지 않는다. `현재 표시된 항목 선택`은 유지하고, 지역·업종 조회에서는 두 버튼을 모두 유지했다. 지역 전체 선택의 기존 `more(true)` 경로를 그대로 사용한다.
2. `AdminRegionManager`에 선택적 `onClearEdit?: () => void`를 추가했다.
3. 정상/삭제 상태 전환, 조회 방식 전환, 업체명 입력 변경 및 검색 실행은 기존 `clearNameSelection()`을 통해 상세정보도 초기화한다. 지역·업종 select 변경, 목록 조회 effect, 이름/지역 조회의 0건 응답, 삭제/복원 실행 완료, `PLACE_DATA_CHANGED` refresh에서도 초기화한다.
4. 목록 업체 클릭의 `onEdit(place.id)` 연결을 유지했다. `더 보기`, 표시 항목 선택, 지역 전체 선택은 현재 상세정보를 불필요하게 닫지 않는다.

### `src/components/AdminPlaceEditor.tsx`

1. `<AdminRegionManager ... onClearEdit={clearLoadedPlace} />`로 연결해 로드된 업체, 수정 항목 선택, 명시 clear 선택, 입력 초안, 확인 대화상자, 오류 상태를 기존 초기화 함수로 정리한다.
2. `clearLoadedPlace`를 `useCallback`으로 고정했다. 부모 재렌더만으로 목록 조회 effect가 다시 실행되거나 열린 상세정보가 바로 닫히지 않도록 했다.
3. 지연 응답 테스트에서 상세 로딩 중 초기화해도 이전 응답이 상세를 다시 여는 문제를 재현했다. 초기화 세대 번호를 비교하여 이전 상세 로딩의 성공/오류와 저장 후 재조회 응답이 닫힌 상세를 되살리지 않도록 했다.
4. 저장으로 발생한 목록 refresh가 상세를 초기화한 경우에는 자동으로 다시 열지 않는다. 초기화되지 않은 기존 편집 흐름은 저장 후 최신값 재로딩을 유지한다. 저장 payload와 transaction은 변경하지 않았다.

### `tests/adminNameSearch.test.ts`

- 업체명 모드의 중복 버튼 미표시와 표시 항목 선택, 지역 모드의 두 선택 버튼 및 pagination을 검증하도록 기존 테스트를 갱신했다.
- 상태/방식/지역/업종 변경, 이름 검색 및 재조회, 입력 변경, 0건 결과, 외부 데이터 변경, 삭제/복원 완료 시 상세 초기화를 검증했다.
- 현재 결과를 클릭하면 다시 열리고, 단순 페이지 추가 조회와 focus/visibilitychange에서는 불필요한 초기화나 read가 발생하지 않는지 확인했다.
- 실제 편집 컴포넌트의 callback 연결·안정성·수정 선택 초기화, 늦은 상세 로딩 성공/실패, 저장 refresh 및 저장 후 지연 응답을 검증했다.
- 테스트는 실제 컴포넌트 및 query/batch 코드를 격리된 hooks/I/O로 실행한다. 운영 Firebase 구성과 운영 read/write를 사용하지 않는다.

### `ADMIN_DELETE_UI_CLEANUP_RESULT_20261003.md`

이번 수정, 검증 결과, 제한사항과 인계 내용을 기록했다.

## 검증 결과

수정 전 회귀 테스트에서 중복 버튼 표시와 상세정보 잔존을 재현했다. 후속 테스트에서도 지연 상세 응답과 저장 후 재조회가 상세정보를 다시 여는 문제를 재현한 뒤 수정했다.

최종 실행 명령:

```powershell
node --import tsx --test tests/adminNameSearch.test.ts tests/adminPlaceEditor.test.ts tests/adminAuthRoute.test.ts tests/adminRulesStatic.test.ts tests/placeCrud.test.ts tests/usePlaceQueriesCache.test.ts tests/adminCrudUi.test.mjs tests/adminUi.test.mjs
npm.cmd run lint
npm.cmd run build
git diff --check
```

- 관련 Node suite: **61 PASS / 0 FAIL / 0 SKIP**, exit 0. 이 중 `adminNameSearch.test.ts`는 **19 PASS**다.
- `npm.cmd run lint` (`tsc --noEmit`): **PASS**, exit 0.
- `npm.cmd run build` (`vite build`): **PASS**, exit 0, 1,724 modules.
- 빌드 JS 크기는 829.85 kB이며 500 kB 초과 청크 경고가 출력됐다. 빌드 실패는 아니며 이번 수정에서 번들 분할은 하지 않았다.
- `git diff --check`: **PASS**. Git의 LF→CRLF 안내만 있었고 whitespace 오류는 없었다.

## 기존 기능 영향과 회귀

- 검증한 범위에서 삭제/복원 batch, 선택, prefix 검색 상한, raw snapshot pagination, 캐시 재사용/무효화, 명시 재조회, read 절감, 관리자 권한/route, 기존 편집 payload 계약의 회귀는 발견되지 않았다.
- Firestore 조회 함수, 삭제/복원 transaction, Rules, indexes, 데이터 구조, 의존성은 변경하지 않았다.
- focus/visibilitychange 자동 조회를 추가하지 않았다.
- `STATE.md`, `PROJECT_INTENT.md`는 수정하지 않았다. 기존 untracked 파일도 보존했다.
- commit/push, PR, main merge, Vercel/GitHub Pages/Firebase 배포는 실행하지 않았다. 결과 파일은 현재 로컬 작업공간에 있다.

## 남은 검증 및 인계

- 이번 검증은 격리된 컴포넌트 동작 테스트, 정적 Rules 계약 검사, 서버 렌더링, TypeScript 및 production build 범위다.
- 실제 브라우저의 데스크톱/모바일 표시, 운영 로그인, Firestore Emulator/운영 DB를 통한 E2E는 이번 작업에서 실행하지 않았다. 자동 테스트 통과를 운영 검증이나 Owner 수락으로 기록하지 않는다.
- 다음 담당은 이 결과와 로컬 diff를 검토할 수 있다. 원격 반영과 배포는 이번 요청 범위에 포함하지 않았다.
