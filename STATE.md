# STATE — 현재 작업 snapshot

> 재개 Entry Point: `agent-collab-kit/README.md`. Kit AGENTS → 루트 INTENT/STATE 순서로 읽고 원격 sync 후 남은 작업만 진행한다.

## 현재

- **WORK_ID:** admin-place-editor-v1
- **Branch:** `feature/firestore-place-ui`
- **요구사항 기준:** 루트 `requirement.md`, `ADMIN_PLACE_EDITOR_OWNER_E2E_FIX.md`
- **현재 단계:** Owner E2E에서 발견된 다중 Field 확인 누락 설명 문제와 운영 Place update Rules 거부의 원인을 규명해 최소 수정했고, 자동·Emulator·독립 검증 및 Rules/Hosting 운영 재배포를 완료했다.
- **현재 담당 / LAST_UPDATED_BY:** Hank, 2026-09-20
- **다음 담당 / 다음 행동:** 연결된 실제 Owner browser가 생기면 아래 수동 확인 항목만 수행한다. 새 credential/custom token을 만들거나 Rules를 우회하지 않는다.
- **Blocker:** Codex browser runtime에 연결된 browser가 0개라 수정 후 실제 Owner 로그인 UI write/화면 반영/복원 및 owner favorites 클릭 회귀를 자동 실행하지 못했다. Firebase CLI 로그인과 웹 앱 browser 연결은 별개다.
- **Hosting:** https://dangjeju.web.app
- **Pages:** https://tonykks.github.io/DANGJEJU_2/
- **Firebase CLI session:** 이번 Rules/Hosting 재배포에만 Owner 로그인을 사용했고, 모든 Firebase 작업이 끝난 뒤 공식 `firebase logout`과 비민감 count로 제거 여부를 확인한다.

## 이번 결함의 정확한 원인과 수정

- 실제 화면 대상인 `아우아우` Place/Source를 read-only로 확인하고, 그 live document shape와 UI가 만드는 `한 줄 설명 + 전화번호 + 대표 이미지 URL` 3-Field payload를 그대로 Emulator fixture로 재현했다.
- client edit plan은 세 실제 변경값을 모두 `changes`, confirmation, Firestore patch에 포함했다. 선택했지만 effective value와 같은 항목만 의도적으로 제외되고 있었으나 제외 이유가 화면에 없었다.
- 실제 운영 shape의 동일 payload는 기존 Rules에서 `Unable to evaluate expression as maximum of 1000 expressions reached`로 거부됐다. 관리자 문서 누락이나 client allowlist 위반이 아니라 `validSearch()`의 반복 map/key 평가가 live-sized request에서 Rules 표현식 한도를 넘은 것이 원인이었다.
- Rules는 `data.search`와 허용 key 목록을 local binding으로 1회 계산하도록만 최적화했다. Place update allowlist, audit/search 검증, 보호 필드, create/delete 거부, Source/admins write 거부, favorites 소유자 계약은 넓히거나 약화하지 않았다.
- edit plan은 `unchangedSelections`를 반환하고 confirmation에 `현재 표시값과 같아 저장에서 제외된 선택 항목`을 명시한다. 여러 실제 edit/clear의 modal 항목과 patch가 일치하며 체크하지 않은 Field는 그대로다.
- 이미지 파일 업로드/Storage는 범위에 넣지 않았고 기존 이미지 URL 입력 방식을 유지했다.

## 유지되는 구현 계약

- `admins/{uid}`의 `role: "admin"`, `active: true`를 Firebase Auth UID로 확인한다. Client는 자기 관리자 문서만 읽고 관리자 collection 쓰기는 금지한다.
- 활성 관리자에게만 Header `관리` 버튼을 표시하고 `#/admin/places` hash route를 사용한다. 비로그인·비관리자는 편집 화면에 머물 수 없다.
- 장소명 `name` 접두검색을 Firestore query로 최대 12개만 읽는다. 저장은 Place `updatedAt` revision을 다시 읽는 transaction이고 선택한 nested leaf만 dot-path로 갱신한다.
- KTO `sources` 원문은 쓰지 않는다. 관리자 서비스값/명시 clear → 기존 Place 서비스값 → KTO Source fallback → placeholder 우선순위를 유지한다.
- `manualAdmin`은 `source: ADMIN_UI`, 현재 `changedFields`/`changedTopLevel`, 누적 `managedFields`, `clearedFields`, server timestamp만 보존하며 관리자 UID는 공개 Place에 저장하지 않는다.
- 수정된 Place의 `search.*`만 TypeScript로 재계산하고 Python 기준과 score/hash parity를 유지한다.

## Codex CLI / agy CLI 사용

- **Codex CLI 0.155.1:** 실제 live shape/payload 재현 결과와 Rules expression-limit 오류를 입력으로 원인 분석과 최소 구현을 수행했다. Rules 검색 검증 local binding 최적화, 다중 edit/clear·unchanged feedback, 관련 회귀 test를 만들었다. commit/push와 운영 배포는 CLI에 맡기지 않았다.
- **agy CLI 1.2.7:** 최종 diff를 별도 검토하고 보안 계약 유지와 UI/fixture 회귀를 **PASS** 판정했다. 이어 정확한 Firestore Emulator 명령을 독립 실행해 exit 0, tests 1 / pass 1 / fail 0 / skipped 0을 확인했다. 임시 permission/workspace 허용은 검증 직후 원상복구했다.

## 검증 결과

- `npm.cmd run lint`: PASS.
- 관련 Node suite: **67 total / 66 PASS / 1 SKIP**. 통합 실행의 단일 SKIP은 Emulator 환경 부재 때문이며 아래 별도 실행에서 PASS했다.
- demo Firestore Emulator: **1 PASS / 0 FAIL / 0 SKIP**. 실제 live shape의 3-Field 관리자 update 허용, 일반 사용자 update 거부, Place create/delete 거부, KTO Source write 거부, admins client write 거부, search 보호값 공격 거부, favorites 소유자 허용/타인 거부를 검증했다.
- Python search derivation: **7 PASS**. pilot/full import 회귀: **21 PASS**.
- Firebase root build와 Pages `/DANGJEJU_2/` base build: 각각 1,721 modules, PASS. 약 799 kB 단일 JS chunk warning은 기존 비차단 경고다.
- 실제 live `아우아우` shape + 실제 client transaction payload의 clean Emulator diagnostic: 3개 값 저장과 search hash 변경 모두 PASS.
- 활성 Google-provider Owner 관리자 문서: UID/이메일을 출력·저장하지 않고 read-only로 재검증, active admin 1명과 일치 PASS.
- Firestore Rules live deploy: compile/release PASS. 기존 미사용 helper warning 1개는 기능 영향이 없어 수정하지 않았다.
- Firebase Hosting live deploy: 새 frontend bundle release PASS. 배포 후 HTML/JS/CSS와 placeholder asset HTTP 200, Hosting JS가 local root build와 일치 PASS.
- 공개 운영 Firestore read-only smoke: hero 5개, WEST/CAFE 44개 정렬, Place/Source detail, ID 기반 favorite Place 해석, 32개 region/category query sample 모두 PASS. 승인 domain 3개도 PASS.
- GitHub Pages는 feature push workflow 완료 후 HTML/JS/CSS, `/DANGJEJU_2/` asset prefix, SPA `404.html`, local Pages build hash 일치를 최종 재확인한다.
- `git diff --check`: PASS.

## 운영 데이터와 복원

- 이번 자동 검증은 운영 Place/Source/favorites를 쓰지 않았다. 실패 원인을 production write 재시도로 찾지 않고 실제 문서 read-only snapshot과 Emulator에서 재현했으므로 복원할 운영 test 값이 없다.
- Firestore Rules와 Hosting만 승인 범위 안에서 재배포했다. Storage/Billing, 새 account/credential, PR/main merge는 건드리지 않았다.
- 기존 untracked `NUL`, `tools/kto_data_probe/`는 보존하고 commit에서 제외한다.

## Owner 수동 확인 항목

연결된 실제 Owner browser가 제공되면 다음만 남아 있다.

1. Owner Google 로그인 후 `관리` 버튼과 `#/admin/places` 접근을 확인한다.
2. `아우아우` 등 업체를 검색하고 영향이 적은 Field 1개를 변경해 confirmation과 실제 사용자 화면 반영을 확인한다.
3. 즉시 원래 값으로 복원하고 공개 화면에서 복원을 확인한다.
4. 찜 추가 → 삭제 → 재로그인 후 상태 복원을 확인한다.

## handoff

bugfix 구현, live-shape 재현, 전체 회귀, Codex/agy 검증, Rules와 Firebase Hosting 운영 적용까지 완료했다. production 데이터 변경은 없었다. 연결 browser가 없어서 실제 Owner UI write/복원과 owner favorites 클릭만 수동 확인 대상으로 남는다.
