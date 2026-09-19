# STATE — 현재 작업 snapshot

> 재개 Entry Point: `agent-collab-kit/README.md`. Kit AGENTS → 루트 INTENT/STATE 순서로 읽고 원격 sync 후 남은 작업만 진행한다.

## 현재

- **WORK_ID:** admin-place-editor-v1
- **Branch:** `feature/firestore-place-ui`
- **요구사항 기준:** 루트 `requirement.md`
- **현재 단계:** Owner 실제 브라우저 E2E에서 관리자 Place 저장이 `Missing or insufficient permissions`로 실패했고, 여러 Field confirmation 표시도 재검증이 필요해 **bugfix 단계로 재개**한다. 기존 자동/Emulator 검증 완료 기록은 보존하되 실제 E2E 실패를 우선한다.
- **현재 담당 / LAST_UPDATED_BY:** Hank, 2026-09-20
- **다음 담당 / 다음 행동:** Hank가 원격 최신 상태로 sync하고 `ADMIN_PLACE_EDITOR_OWNER_E2E_FIX.md`를 기준으로 실제 live document shape/payload를 재현해 원인을 특정하고 최소 수정·검증·필요한 운영 재배포까지 완료한다.
- **Blocker:** 기술 blocker는 아직 확정되지 않았다. 실제 Owner 브라우저에서 write permission 실패가 재현됐으며 원인 규명이 필요하다. Firebase CLI는 logout 상태이므로 Rules/Hosting 재배포가 필요할 경우 Owner의 정상 `firebase login` 상호작용만 필요할 수 있다.
- **Hosting (운영 재배포 완료):** https://dangjeju.web.app
- **Pages (feature preview):** https://tonykks.github.io/DANGJEJU_2/ — feature push가 GitHub Pages workflow를 자동 실행한다.
- **Firebase CLI session:** 노출됐던 CLI credential은 모든 Firebase 작업 종료 후 공식 `firebase logout`으로 제거했고, 민감정보 없이 `FIREBASE_LOGIN_COUNT=0`을 확인했다. 향후 Firebase CLI 작업에는 Owner의 대화형 `firebase login`이 필요하다.

## 완료 구현

- `admins/{uid}`의 `role: "admin"`, `active: true`를 Firebase Auth UID로 확인한다. Client는 자기 관리자 문서만 읽고 관리자 collection 쓰기는 금지한다.
- 활성 관리자에게만 Header `관리` 버튼을 표시하고, dependency 없는 `#/admin/places` hash route를 사용한다. 비로그인·비관리자는 편집 화면에 머물 수 없고, 일시적 권한 조회 오류는 거부로 오인하지 않고 재시도 UI를 보인다.
- 장소명 `name` 접두검색을 Firestore query로 최대 12개만 읽는다. 전체 2,126개 Catalog 선로딩은 없다. 기존 quota cooldown도 공유한다.
- 현재 사용자 표시정보 전체를 inventory하여 장소명, 분류/권역, 주소/좌표/전화, 이미지 URL, 설명/운영정보, tags, Pet 정책·상세, amenities, 추천/주의를 복수 선택·편집·명시 삭제·변경 전후 확인할 수 있다.
- 이미지 URL은 http/https 및 Instagram host를 검증하고 변경 전/후 preview와 placeholder fallback을 제공한다. Firebase Storage가 이번 승인 범위에 없으므로 파일 업로드는 포함하지 않았다.
- 저장은 Place `updatedAt` revision을 다시 읽는 Firestore transaction이다. 선택한 nested leaf만 dot-path로 갱신하고, 동시 수정이 있으면 reload/reconfirm을 요구한다. 저장 성공 뒤 재조회만 실패한 경우도 저장 실패로 오보하지 않는다.
- 우선순위는 관리자 서비스값/명시 clear → 기존 Place 서비스값 → KTO Source fallback → placeholder다. KTO `sources` 원문은 쓰지 않는다. KTO 전용 Pet 상세는 `adminOverrides.petDetails` sparse override로 보완한다.
- `manualAdmin`은 `source: ADMIN_UI`, 현재 `changedFields`/`changedTopLevel`, 누적 `managedFields`, `clearedFields`, server timestamp만 보존하며 공개 Place에 관리자 UID를 저장하지 않는다.
- Pet 정책/상세의 실제 변경은 자동으로 `ADMIN_CONFIRMED`가 된다. `KTO_OVERLAY_FOUND`는 관리자 입력 필드가 아니며, `ADMIN_CONFIRMED`도 카드·목록·지도·집계에서 확인 데이터로 취급한다.
- 저장 transaction에서 수정된 한 Place의 `search.*`만 TypeScript로 재계산한다. 기존 Python 기준과 점수/hash parity를 유지하며 HTML entity, 공백 숫자, clear 목록 정규화, Firestore Timestamp↔snapshot ISO 경계까지 회귀 테스트한다.
- Rules는 public Place read와 기존 favorites 계약을 유지하고, 활성 관리자만 allowlist된 Place update를 허용한다. Place create/delete, KTO Source write, 관리자 문서 Client write, metadata/search-only update, status spoof, partial nested map, 잘못된 enum/URL/clear를 거부한다. Emulator에서 발견된 1,000-expression 한도를 피하도록 `affected`/`manualAdmin`을 1회 계산하고 실제 변경된 display group만 검증하되, 변경 allowlist·audit·search·보호 필드 계약은 유지한다.

## CLI 사용·독립 검토

- **Codex CLI 0.155.1:** 기존 주 구현 세션에 더해 실제 Emulator의 1,000-expression 실패를 전달해 `firestore.rules` 최소 최적화를 수행했다. CLI 자체 재시험은 20분 제한으로 종료됐으나 변경은 Rules 한 파일에만 남았고, 이후 Hank의 clean Emulator 재실행과 전체 회귀에서 PASS했다. CLI는 commit/push, 운영 Firebase deploy/data 변경을 하지 않았다.
- **agy CLI 1.2.7:** 설치 버전은 사전 예상 1.2.5가 아닌 1.2.7이었다. 최종 diff를 UTF-8 stream-json stdin으로 빈 임시 directory에서 제공하고 workspace/shell/web/MCP/subagent 사용을 금지했다. 1차 `NEEDS_CHANGES`의 sparse optional field Rules guard를 수정한 뒤 최종 재검토는 **PASS**. 두 유효 리뷰 모두 tool/subagent step 0회였다.
- **agy Emulator 독립 검증:** global allowlist에 demo Emulator 정확 명령 1개와 현재 workspace만 임시 허용했다. agy가 실제 `firebase.cmd emulators:exec --only firestore --project demo-admin-place-editor-rules "node_modules\.bin\tsx.cmd --test tests/firestoreRules.test.ts"`를 실행해 exit 0, tests 1 / pass 1 / fail 0 / skipped 0을 관측하고 **PASS** 판정했다. 불필요한 home 검색/`echo Done`은 거부됐고 임시 permission/workspace 항목은 즉시 원상복구했다.

## 검증 결과

- `npm.cmd run lint`: PASS.
- Java: Eclipse Temurin **21.0.12.1 LTS**를 공식 release zip의 SHA-256 검증 후 사용자 PATH에 설치했다. Firebase CLI 15.28.1이 Java 21을 인식했다.
- demo Firestore Emulator: **1 PASS, 0 FAIL, 0 SKIP**. 일반 사용자 Place update 거부, 활성 관리자 update 허용, Place create/delete 거부, KTO Source create/update/delete 거부, admins client write 거부, favorites owner 허용/타인 거부를 실제 Rules로 실행했다.
- `tsx --test tests/*.test.ts tests/*.test.mjs`: **63개 중 62 PASS, 1 SKIP**. 통합 suite에서는 의도대로 Emulator 환경이 없는 단일 test만 SKIP이며 위 별도 Emulator 실행에서 PASS했다.
- `python -m unittest tools.firestore_place_search_fields.test_derive`: **7 PASS**.
- pilot/full import 회귀: **21 PASS**.
- Firebase root base production build: PASS (1,721 modules).
- GitHub Pages `/DANGJEJU_2/` base production build: PASS (1,721 modules).
- 두 build 모두 약 798 kB 단일 JS chunk 경고가 있으나 build 실패나 경로 오류는 아니다.
- `git diff --check`: PASS. Rules static test는 새 `let affected`/`let admin` 구조를 검증하도록 최소 갱신했다.
- Firestore Rules live deploy: `dangjeju` compile/release **PASS**. `displayTopLevelNames` 미사용 경고 1개는 기능 영향이 없고 정상 코드 추가 수정 금지 원칙에 따라 유지했다.
- 현재 Firebase CLI Owner account와 동일 이메일의 활성 Google-provider Firebase Auth user를 Identity Toolkit에서 1명으로 결정적으로 확인했다. UID를 출력·파일 저장하지 않고 그 UID에만 `admins/{uid}` = `{ role: "admin", active: true }`를 생성했으며 재조회 **PASS**.
- 최초 live HTTP에서 Pages는 admin bundle을 포함했으나 Hosting은 stale bundle이었다. root build를 `firebase deploy --only hosting --project dangjeju`로 재배포한 뒤 두 site 모두 HTML/JS/CSS 200, `ADMIN_UI`/admins 계약과 `/admin/places` route 포함 **PASS**.
- 운영 Firestore public Place read와 `name` 접두검색(limit 12) **PASS**. 고유 비인증 probe의 Place update, Source write, admins write, favorites write는 모두 live Rules에서 거부되어 데이터 변경 없음.
- 최종 SHA 정합성: local `HEAD`, `origin/feature/firestore-place-ui`, 실제 remote ref가 모두 `9ce33f4116f22015432a1f695bf9f84b8cd00a65`; 동일 SHA의 GitHub Pages workflow run `35453259375`는 completed/success.
- 최종 live asset 재확인: Hosting/Pages HTML·JS·CSS 모두 HTTP 200, 두 bundle 모두 `/admin/places`와 admin contract 포함. Hosting asset 이름과 SHA-256은 로컬 root build와 일치했다.
- 남은 자동 회귀: 로그인 session 격리·logout/stale UID, 찜 add/delete/계정 전환/실패 복구, 검색 query/cache/quota, 관리자 route/editor/UI를 묶은 **55 PASS, 0 FAIL, 0 SKIP**.
- 읽기 전용 live smoke: 공개 Place read와 `name` 접두검색 양성/limit 12, 비인증 admins list/favorites read 거부 모두 **PASS**.
- Browser runtime은 재확인 시에도 available browser `0`이었다. 브라우저 우회, custom token, 새 account/credential 생성은 하지 않았다.
- Java 21 host 안전 재실행 명령(PowerShell, 운영 접근 없음): `firebase.cmd emulators:exec --only firestore --project demo-admin-place-editor-rules "node_modules\.bin\tsx.cmd --test tests/firestoreRules.test.ts"`.
- Owner 인증 browser가 없어 실제 관리자 UI Place write/restore와 owner favorites 클릭 회귀는 미실행이다. 위험한 인증 우회나 새 credential 생성 대신 Emulator 동적 test, live public search/비인증 deny probe, 두 live bundle smoke까지만 수행했다.

## 승인 경계 / 현재 Owner 승인

- **이번 V1에서 승인됨:** 로컬 Java 21 설치, Firestore Emulator 동적검증, 검증 통과 후 `dangjeju` Firestore Rules live deploy, 현재 Owner 계정의 정확한 Firebase Auth UID 확인 및 `admins/{uid}` 문서 1회 생성, 관리자 기능 live E2E, 검증을 위한 최소·가역적 Place update 후 원상복원(필요 시).
- 관리자 UID는 현재 Owner의 실제 인증 계정에서 **결정적으로 확인**해야 하며 favorites 경로나 추측으로 고르지 않는다.
- 정상 코드는 실제 테스트 실패가 확인된 경우에만 최소 수정한다.
- **여전히 승인 범위 밖:** Firebase Storage/Billing 신규 활성화, 새 계정/credential 생성·요구, PR 생성, main merge, 범위를 바꾸는 기능 추가.
- Firebase Hosting은 live 검사에서 admin bundle 부재가 실제 확인되어 승인 조건에 따라 재배포했다. Storage/Billing·PR/main merge는 변경하지 않았다.
- 기존 untracked `NUL`, `tools/kto_data_probe/`는 보존하고 이번 commit 대상에서 제외한다.

## 현재 발견된 Owner E2E 결함 — 수정 필요

- Owner 실제 브라우저에서 관리자 로그인/관리 버튼/관리 경로/업체 검색은 성공했다.
- 여러 Field를 선택·입력했으나 confirmation modal에 예상보다 적은 변경 항목이 표시되는 현상이 확인됐다. 정확한 원인은 `ADMIN_PLACE_EDITOR_OWNER_E2E_FIX.md` 기준으로 재현·진단한다.
- 실제 `확인하고 저장` 시 Firestore가 `Missing or insufficient permissions`로 Place update를 거부했다. Emulator synthetic PASS와 달리 **실제 live document shape/payload 기반 E2E가 실패**했으므로 현재 V1은 수정 후 재검증 상태다.
- 이미지 파일 업로드는 이번 수정 범위가 아니며 URL 입력 방식을 유지한다.
- **다음 행동:** Hank가 원격 sync 후 `ADMIN_PLACE_EDITOR_OWNER_E2E_FIX.md`를 읽고 Codex CLI 구현/수정 + agy 독립 검증으로 두 현상을 끝까지 해결한다.

## Owner 수동 확인 항목

1. 지원 browser에서 현재 Owner Google 계정으로 로그인한다.
2. Hosting/Pages에서 `관리` 버튼 표시, `#/admin/places` 접근, 업체 검색을 확인한다.
3. 영향이 적은 field 1개를 수정해 실제 화면 반영을 확인하고 즉시 원래 값으로 복원한다.
4. 찜 추가 → 삭제 → 재로그인 후 저장 상태 복원을 확인한다.
5. 이후 Firebase CLI 작업이 필요할 때만 Owner가 `firebase login`으로 다시 인증한다.

## handoff

코드 구현/독립 review/Emulator/agy 검증과 Rules·Owner admin·Hosting 운영 적용은 완료됐다. 최종 SHA/Pages workflow, 두 live bundle, 로그인·찜·검색 자동 회귀, 읽기 전용 Firestore smoke도 PASS이며 Firebase CLI session은 제거됐다. 남은 것은 연결 browser 부재로 자동화할 수 없었던 위 Owner 인증 UI click/write 수동 확인뿐이다.
