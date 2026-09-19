# STATE — 현재 작업 snapshot

> 재개 Entry Point: `agent-collab-kit/README.md`. Kit AGENTS → 루트 INTENT/STATE 순서로 읽고 원격 sync 후 남은 작업만 진행한다.

## 현재

- **WORK_ID:** admin-place-editor-v1
- **Branch:** `feature/firestore-place-ui`
- **요구사항 기준:** 루트 `requirement.md`
- **현재 단계:** 코드 구현·로컬 검증·agy 독립 재검토 완료. feature branch push 후에는 운영 적용 승인만 남는다.
- **현재 담당 / LAST_UPDATED_BY:** Hank, 2026-09-19
- **다음 담당 / 다음 행동:** Toby/Owner가 아래 운영 적용 경계를 검토한다. 승인 전에는 Rules live deploy, 초기 관리자 문서 생성, Storage/Billing 설정을 하지 않는다.
- **Blocker:** 코드 blocker 없음. 운영 관리자 화면의 실제 쓰기 E2E는 Rules live deploy와 안전한 초기 `admins/{uid}` 등록 승인 전에는 수행할 수 없다.
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

## 검증 결과

- `npm.cmd run lint`: PASS.
- `tsx --test tests/*.test.ts tests/*.test.mjs`: **63개 중 62 PASS, 1 SKIP**. SKIP은 Java가 없어 실행하지 못한 Firestore Emulator Rules 동적 테스트다.
- `python -m unittest tools.firestore_place_search_fields.test_derive`: **7 PASS**.
- pilot/full import 회귀: **21 PASS**.
- Firebase root base production build: PASS (1,721 modules).
- GitHub Pages `/DANGJEJU_2/` base production build: PASS (1,721 modules).
- 두 build 모두 약 798 kB 단일 JS chunk 경고가 있으나 build 실패나 경로 오류는 아니다.
- `git diff --check`: PASS. Java/Firestore Emulator 부재로 Rules 실제 compile·동적 권한 테스트는 미실행이며, 정적 계약 테스트와 attack case는 추가했다.
- live Rules/admin이 의도적으로 미적용이므로 관리자 실제 로그인·write browser E2E는 아직 수행하지 않았다.

## 승인 경계 / 아직 하지 않은 것

- Firestore Rules live deploy 안 함.
- 초기 `admins/{uid}` 문서 생성·변경 안 함.
- Firebase Hosting 재배포 안 함.
- Firebase Storage/Billing 활성화 및 파일 업로드 안 함.
- 운영 Place/Source/favorites 데이터 읽기·쓰기 안 함.
- PR 생성·main merge 안 함.
- 기존 untracked `NUL`, `tools/kto_data_probe/`는 보존했고 이번 commit 대상이 아니다.

## 다음 승인 순서

1. Toby/Owner가 변경 코드와 Rules를 검토하고 Rules live deploy 여부를 승인한다.
2. 승인된 안전한 1회 절차로 실제 담당자 UID의 `admins/{uid}` 문서를 생성한다.
3. 관리자 로그인/직접 URL 거부/Place update/Source write 거부를 Firebase Hosting과 Pages에서 live E2E 확인한다.
4. 이미지 파일 업로드가 필요하면 별도 Storage/Billing·Rules 결정을 한다. 현재 V1 완료 범위는 URL 입력이다.

## handoff

코드 구현 Acceptance는 충족했고 agy 최종 판정은 PASS다. feature push는 Pages 자동 배포를 트리거하지만 Firebase Hosting이나 Firestore Rules를 배포하지 않는다. 다음 작업은 위 운영 승인 없이는 시작하지 않는다.
