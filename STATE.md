# STATE — 현재 작업 snapshot

> 일지가 아니다. **지금 재개에 필요한 최신 사실만** 남기고 교체한다.

## 현재

- **WORK_ID:** header-saved-count-fix
- **목표 참조:** Header 찜 숫자만 `savedPlaceIds.length`로 표시 (저장/복원 로직 미변경)
- **Branch:** `feature/firestore-place-ui`
- **현재 단계:** 수정·배포 완료. Owner 로그인 세션에서 Header 숫자 최종 확인 요청.
- **현재 담당:** Geni → Owner
- **다음 담당 / 다음 행동:** Owner가 https://dangjeju.web.app 하드 리프레시 후 Header 배지=Drawer 수 일치 확인. PR/main 없음.
- **Blocker:** 없음 (에이전트 브라우저 Google 팝업 차단으로 로그인 UI 재현 불가 — 코드/단위/배포는 완료)
- **LAST_UPDATED_BY:** Geni
- **Hosting:** https://dangjeju.web.app

## 완료된 사실

- 원인: `Header savedCount={savedPlacesList.length}`였고, resolved places는 drawer open 시에만 로드 → 닫힌 상태면 0
- 수정: `App.tsx` → `savedCount={savedPlaceIds.length}`
- lint PASS, `node --test` 26 PASS (header contract test 추가), build PASS
- Hosting 재배포 완료
- 선행 Query-first live cutover + Ani PASS 유지

## 관련 파일

- `src/App.tsx`, `tests/headerSavedCount.test.ts`
- (이전) Query-first: `PROJECT_INTENT.md`, `tools/firestore_place_search_fields/`
