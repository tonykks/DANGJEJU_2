# STATE — 현재 작업 snapshot

> 재개 Entry Point: `agent-collab-kit/README.md`. Kit AGENTS → 루트 INTENT/STATE 순서로 읽고 원격 sync 후 남은 작업만 진행한다.

## 현재

- **WORK_ID:** github-pages-preview
- **목표 참조:** GitHub Pages 팀 공유 미리보기. Firebase Hosting 재배포/변경 및 PR/main merge 금지.
- **Branch:** `feature/firestore-place-ui`
- **현재 단계:** Pages 배포·HTTP/자산·읽기 전용 SDK·lint/test/build 확인 완료. 실제 브라우저 E2E는 미완료.
- **현재 담당 / LAST_UPDATED_BY:** Codex (Hank), 2026-09-19
- **다음 담당 / 다음 행동:** 브라우저 연결 후 아래 남은 E2E만 검증하고 STATE 갱신·commit/push. 기존 완료 작업을 재구현하지 않는다.
- **Blocker:** Browser runtime 연결 목록이 비어 있어 실제 UI 조작 불가. 브라우저 연결을 요청한 상태. Owner 수락은 미기록.
- **Hosting (운영, 미변경):** https://dangjeju.web.app
- **Pages (미리보기):** https://tonykks.github.io/DANGJEJU_2/
- **검증된 배포 코드:** `b690ea2` (STATE 문서 commit 자체의 SHA는 맞추지 않음)

## 배포 결과 / 미실행 원인

- 재개 시 fetch 후 로컬/원격 모두 `01cd077`, divergence 0/0. 기존 미추적 `NUL`, `tools/kto_data_probe/` 보존.
- 포크에서 Actions permissions는 enabled였지만 workflow 등록 0건·run 0건·workflow 조회/enable 404였다. 기존 `enabled=true`, `allowed_actions=all` 설정 재적용 후 workflow가 active로 등록되어 실행 가능해졌다.
- 별도 배포 장애: `github-pages` 환경 허용 브랜치가 main뿐이었다. 기존 main을 유지하고 `feature/firestore-place-ui`만 추가했다.
- `01cd077` feature ref 수동 실행 성공: https://github.com/tonykks/DANGJEJU_2/actions/runs/35438799364
- 이미지 경로 수정 `b690ea2` push 자동 실행·배포 성공: https://github.com/tonykks/DANGJEJU_2/actions/runs/35439158618
- workflow 파일은 이번 작업에서 미수정. 기존 Pages CLI base `/DANGJEJU_2/`, Firebase secrets 4개, SPA fallback 유지.
- Auth 공개 설정 API에서 `tonykks.github.io`, `dangjeju.web.app`, `dangjeju.firebaseapp.com` 허용 확인. Auth 설정 변경 없음.

## 최소 수정 / 정상 기능 영향

- **파일·로직:** `src/lib/placeAdapter.ts`의 `PLACEHOLDER_IMAGE` 상수 한 줄.
- **원인:** `/place-placeholder.svg`는 Pages 도메인 루트에서 404, `/DANGJEJU_2/place-placeholder.svg`는 200. 관련 이미지 경로 사용처를 검색·점검했다.
- **수정:** Vite `BASE_URL`을 사용하고 Node 테스트 환경은 `/` fallback. Pages 사진 대체 이미지가 배포 하위 경로를 따른다.
- **영향 확인:** 기본 base `/` build JS/CSS가 기존 Firebase 배포 자산과 SHA-256까지 동일. 검색·로그인·찜·탭 리셋 로직 및 Firebase 설정/Rules/데이터는 미수정.

## 완료된 검증

- Pages/Firebase 홈·JS·CSS HTTP 200. Pages 실제 자산이 로컬 Pages build와 SHA-256 일치. 대체 SVG 200 및 Pages `404.html`=index 확인.
- Firebase HTML/JS/CSS 해시가 수정 전후 동일. Hosting 재배포 없음. Hosting release metadata 조회는 ADC 권한 403으로 확인 불가; 실제 서비스 자산 비교로 미변경을 검증했다.
- 비로그인 Firebase client SDK 읽기: hero 5개·점수 기준·지도 좌표, 지역 4×유형 8개 조건 각각 limit 1 조회 성공, 서부 카페 44개 조건·정렬·UNKNOWN 포함·좌표 확인.
- 상세 Source 읽기·pet 정보, 찜 placeId 조회 성공. 로그인 세션/찜 쓰기 E2E를 대신하는 검증은 아니다.
- `npm run lint` PASS.
- `node --import tsx --test tests/*.test.ts tests/*.test.mjs`: 40 PASS, 0 FAIL, 1 SKIP. 제외 항목은 Firestore Rules emulator 테스트(Java/로컬 emulator 없음).
- 기본 `npm run build` 및 Pages `--base=/DANGJEJU_2/` build PASS. 기존 500 kB chunk 경고 유지; 범위 밖 분할/의존성 변경 없음.
- 상세 HTTP/SDK 근거는 local-only `private_probe/pages_readonly_verification.json`, `private_probe/pages_final_http_verification.json`. 원시 근거·credential은 commit하지 않음.

## 남은 검증 (완료로 간주하지 않음)

1. 연결된 브라우저에서 Pages와 Firebase의 desktop/mobile 화면, console/runtime 오류 확인.
2. 실제 Google 로그인/로그아웃, 찜 추가/삭제·재로그인 복원·사용자별 격리 확인. 검증용 찜은 원상 복원.
3. 실제 검색 버튼·목록과 지도 연동·마커·상세 팝업/탭 리셋 검증.
4. 필요 시 Java/Firestore Emulator가 준비된 환경에서 제외된 Rules 테스트 수행. 운영 DB에 테스트 쓰기 금지.
5. 결과를 STATE에 반영하고 feature branch에 commit/push. Firebase Hosting 배포 및 PR/main merge는 하지 않는다.
