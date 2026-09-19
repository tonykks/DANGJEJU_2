# STATE — 현재 작업 snapshot

> 일지가 아니다. **지금 재개에 필요한 최신 사실만** 남기고 교체한다.

## 현재

- **WORK_ID:** github-pages-preview
- **목표 참조:** 완성본을 GitHub Pages에 팀 공유. Firebase Hosting은 변경하지 않음.
- **Branch:** `feature/firestore-place-ui`
- **현재 단계:** Pages workflow·Auth domain·secrets 반영 후 배포·검증 진행
- **현재 담당:** Geni
- **다음 담당 / 다음 행동:** Actions deploy 완료 → Pages/Firebase live 확인 → STATE 확정. PR/main 없음.
- **Blocker:** 없음
- **LAST_UPDATED_BY:** Geni
- **Hosting (운영, 미변경):** https://dangjeju.web.app
- **Pages (미리보기):** https://tonykks.github.io/DANGJEJU_2/

## 구현 메모

- 앱 로직(검색/찜/로그인/탭 리셋) 미수정
- `.github/workflows/main.yml`: feature branch 배포 + `VITE_FIREBASE_*` secrets + `404.html` SPA fallback
- Firebase Auth authorized domain에 `tonykks.github.io` 추가 (web.app/firebaseapp.com 유지)
- `vite.config.ts` base는 그대로. Pages만 CLI `--base=/DANGJEJU_2/`
- Firebase Hosting 재배포 **하지 않음**

## 선행 완료 (건드리지 않음)

- Query-first live cutover
- Header `savedPlaceIds.length`
- 상세 팝업 첫 탭 리셋
- orphan favorite 정리 (kto-* 유지)
