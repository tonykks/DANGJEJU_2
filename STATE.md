# STATE — 현재 작업 snapshot

> 재개 Entry Point: `agent-collab-kit/README.md`. Kit AGENTS → 루트 INTENT/STATE 순서로 읽고 원격 sync 후 남은 작업만 진행한다.

## 현재

- **WORK_ID:** admin-place-editor-v1
- **Branch:** `feature/firestore-place-ui`
- **요구사항 기준:** 루트 `requirement.md`
- **현재 단계:** admin-place-editor-v1 코드는 그대로 유지. 후속 Firestore Rules Emulator 동적 검증을 agy에 맡겨 시도했으나 이 호스트에 Java가 없어 `BLOCKED_ENVIRONMENT`; 실제 Emulator test는 미실행이다.
- **현재 담당 / LAST_UPDATED_BY:** Hank, 2026-09-19
- **다음 담당 / 다음 행동:** Owner가 2026-09-19 **이번 V1을 중간 승인 없이 끝까지 완료하도록 명시 승인**했다. Hank는 Java 21 설치 → Emulator Rules 동적검증 → 필요 시 최소 수정·재시험 → Firestore Rules live deploy → 현재 Owner 계정의 정확한 Firebase Auth UID 확인 → `admins/{uid}` 관리자 문서 1회 생성 → 관리자 live E2E → STATE 갱신·commit/push까지 자율적으로 완료한다.
- **Blocker:** 현재 `java` command/PATH 없음은 작업 blocker가 아니라 설치 후 해소할 개발환경 항목이다. 설치된 Firebase CLI는 15.28.1이며 CLI v15 Emulator 실행에는 Java 21 이상이 필요하다. **Java 21 설치, Rules live deploy, Owner 관리자 등록, 검증용 운영 DB의 최소·가역적 E2E write까지 이번 V1 범위에서 승인됨.** 새 Billing/Storage 활성화, 새 계정/credential 요구, PR/main merge는 여전히 승인 범위 밖이다.
- **Hosting (기존 운영, 미배포):** https://dangjeju.web.app
- **Pages (feature preview):** https://tonykks.github.io/DANGJEJU_2/ — feature push가 GitHub Pages workflow를 자동 실행한다.

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
- Rules는 public Place read와 기존 favorites 계약을 유지하고, 활성 관리자만 allowlist된 Place update를 허용한다. Place create/delete, KTO Source write, 관리자 문서 Client write, metadata/search-only update, status spoof, partial nested map, 잘못된 enum/URL/clear를 거부한다.

## CLI 사용·독립 검토

- **Codex CLI 0.155.1:** 주 분석·구현·테스트에 실제 사용. Windows restricted-token helper가 workspace-write에서 실패하여 승인된 외부 경계 안에서 `-s danger-full-access -a never`로 두 구현 세션을 실행했다. CLI는 git commit/push, Firebase data 접근/deploy, 관리자 생성은 하지 않았다. 한 Firebase CLI version 확인이 public update-check를 시도했으나 Firebase project 접근·변경은 없었다.
- **agy CLI 1.2.7:** 설치 버전은 사전 예상 1.2.5가 아닌 1.2.7이었다. 최종 diff를 UTF-8 stream-json stdin으로 빈 임시 directory에서 제공하고 workspace/shell/web/MCP/subagent 사용을 금지했다. 1차 `NEEDS_CHANGES`의 sparse optional field Rules guard를 수정한 뒤 최종 재검토는 **PASS**. 두 유효 리뷰 모두 tool/subagent step 0회였다.
- **agy Emulator 후속 검증:** headless sandbox에서 command 실행은 별도 승격 승인을 요구해 자동 거부됐고 위험한 전체 권한 우회는 사용하지 않았다. 관측 환경과 실제 Rules/test source를 stdin으로 제공한 독립 점검은 **BLOCKED_ENVIRONMENT** 판정, tool/subagent step 0회였다. 동적 실행을 했다고 간주하지 않는다.

## 검증 결과

- `npm.cmd run lint`: PASS.
- `tsx --test tests/*.test.ts tests/*.test.mjs`: **63개 중 62 PASS, 1 SKIP**. SKIP은 Java가 없어 실행하지 못한 Firestore Emulator Rules 동적 테스트다.
- `python -m unittest tools.firestore_place_search_fields.test_derive`: **7 PASS**.
- pilot/full import 회귀: **21 PASS**.
- Firebase root base production build: PASS (1,721 modules).
- GitHub Pages `/DANGJEJU_2/` base production build: PASS (1,721 modules).
- 두 build 모두 약 798 kB 단일 JS chunk 경고가 있으나 build 실패나 경로 오류는 아니다.
- `git diff --check`: PASS. Java/Firestore Emulator 부재로 Rules 실제 compile·동적 권한 테스트는 미실행이며, 정적 계약 테스트와 attack case는 추가했다.
- Ani가 `tests/firestoreRules.test.ts`를 독립 점검한 결과 harness는 일반 사용자 Place update 거부, 활성 관리자 update 허용, Place create/delete 거부, KTO Source create/update/delete 거부, admins client write 거부, favorites owner 허용/타인 거부의 6개 목표를 모두 포함한다.
- Java 21 host 안전 재실행 명령(PowerShell, 운영 접근 없음): `firebase.cmd emulators:exec --only firestore --project demo-admin-place-editor-rules "node_modules\.bin\tsx.cmd --test tests/firestoreRules.test.ts"`.
- Emulator 실제 실패가 없으므로 `firestore.rules`, test, app code는 이번 후속 단계에서 변경하지 않았다.
- live Rules/admin이 의도적으로 미적용이므로 관리자 실제 로그인·write browser E2E는 아직 수행하지 않았다.

## 승인 경계 / 현재 Owner 승인

- **이번 V1에서 승인됨:** 로컬 Java 21 설치, Firestore Emulator 동적검증, 검증 통과 후 `dangjeju` Firestore Rules live deploy, 현재 Owner 계정의 정확한 Firebase Auth UID 확인 및 `admins/{uid}` 문서 1회 생성, 관리자 기능 live E2E, 검증을 위한 최소·가역적 Place update 후 원상복원(필요 시).
- 관리자 UID는 현재 Owner의 실제 인증 계정에서 **결정적으로 확인**해야 하며 favorites 경로나 추측으로 고르지 않는다.
- 정상 코드는 실제 테스트 실패가 확인된 경우에만 최소 수정한다.
- **여전히 승인 범위 밖:** Firebase Storage/Billing 신규 활성화, 새 계정/credential 생성·요구, PR 생성, main merge, 범위를 바꾸는 기능 추가.
- Firebase Hosting 재배포는 관리자 E2E에 꼭 필요한 코드 변경이 실제 발생한 경우에만 기존 절차로 수행한다. 불필요하면 재배포하지 않는다.
- 기존 untracked `NUL`, `tools/kto_data_probe/`는 보존하고 이번 commit 대상에서 제외한다.

## 남은 실행 순서 — 중간 승인 없이 완료

1. 이 PC에 Java 21 JDK를 설치하고 PATH/`java -version`을 확인한다.
2. demo-project Emulator 명령을 실행해 6개 Rules 목표를 동적으로 증명한다.
3. 실패 시 원인을 분석해 최소 수정하고 Emulator + 기존 test/lint/build를 재실행한다.
4. PASS 후 `dangjeju` Firestore Rules를 live deploy하고 배포 성공을 확인한다.
5. 현재 Owner가 실제로 로그인하는 Firebase Auth 계정의 UID를 안전하게 확인하고, 그 UID에만 `admins/{uid}` = `{ role: "admin", active: true }`를 1회 생성한다. UID를 추측하지 않는다.
6. GitHub Pages와 Firebase Hosting에서 관리자 버튼/직접 URL 차단/Place update/Source write 거부/기존 로그인·찜·검색 회귀를 live E2E 확인한다. 실제 Place write가 필요하면 영향이 적은 필드를 사용하고 원래 값을 기록한 뒤 검증 후 원상복원한다.
7. 결과를 STATE에 기록하고 feature branch commit/push 후 최종 SHA와 PASS/잔여 blocker만 보고한다.
8. 새 Billing/Storage·새 credential·PR/main merge가 필요한 경우에만 그 지점에서 멈춘다.

## handoff

코드 구현/독립 review Acceptance는 충족했고 기존 agy 코드 판정은 PASS다. Owner는 2026-09-19 이번 V1을 **중간 승인 없이 운영 적용·관리자 등록·live E2E까지 끝까지 완료**하도록 승인했다. Hank는 위 남은 실행 순서를 자율적으로 수행하고, 완료 후 STATE 갱신·commit/push·최종 보고 후 중단한다.
