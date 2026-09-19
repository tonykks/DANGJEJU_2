# DECISIONS — 장기 유효한 중요 결정만

> 정상 진행은 반복 기록하지 않는다.
> 예외·충돌·중요 범위 변경처럼 **나중에 다시 판단에 영향**을 주는 결정과 이유만 남긴다.

| 날짜 | WORK_ID | 결정 | 이유 |
|---|---|---|---|
| 2026-09-11 | kto-data-probe-step3 | 수집 프로그램은 `tools/kto_data_probe/`, Raw/CSV/리포트는 `private_probe/` | Public 제품 repo와 재사용 코드/내부 데이터를 분리한다. |
| 2026-09-11 | kto-data-probe-step3 | 제주 목록은 KorService2 `areaBasedList2` + `lDongRegnCd=50` 전체 pagination | Owner가 검증한 법정동 코드다. `areaCode=39`로 바꾸지 않는다. |
| 2026-09-11 | kto-data-probe-step3 | Pet은 `detailPetTour2` 전체목록(contentId 없음)을 먼저 확인하고, 불가 시 제주 전체 contentId fallback | `searchKeyword2`는 주 수집 방식이 아니다. |
| 2026-09-11 | kto-data-probe-step3 | 인증키 환경변수는 `KTO_SERVICE_KEY_DECODING` | Secret을 Public Git·STATE 본문에 남기지 않는다. |
| 2026-09-13 | db-schema-design-v1 | KTO 원천 필드와 댕제주 서비스 필드를 분리한다 | contentTypeId / lclsSystm* / serviceCategory를 덮어쓰면 출처 의미가 사라진다. |
| 2026-09-13 | db-schema-design-v1 | 정책 boolean은 TriState. Pet 미매칭은 UNKNOWN이지 FALSE가 아니다 | `false`와 정보 없음을 혼동하면 출입 불가로 왜곡된다. |
| 2026-09-13 | db-schema-design-v1 | 복수 contentId는 자동 병합하지 않고 PlaceRelation으로만 남긴다 | 같은 상호라도 유형·Pet 오버레이가 다를 수 있다. |
| 2026-09-13 | db-schema-design-v1 | `place.address` 초기값은 KTO `addr1`만 쓴다 | addr2 결합은 UI 표시 규칙이다. |
| 2026-09-14 | db-auth-tech-selection | Auth+DB: Firebase Authentication + Cloud Firestore Native | Hank+Ani PASS. |
| 2026-09-14 | firebase-auth-favorites | Google 로그인 1종 + uid Favorite. Place 전체 전환은 후속 | Owner/Toby 승인. |
| 2026-09-15 | firestore-query-first-search | 전체 Catalog 선로딩 폐기. `places.search.*`만 파생·query. **`listView` 금지** | Owner override vs Hank draft. 기존 Place 필드 + search만 사용. |
| 2026-09-15 | firestore-query-first-search | V2: `BRIEF.md` 제거. 승인 내용은 INTENT/STATE/DECISIONS로 흡수 | Kit V2는 BRIEF 미사용. 재승인 절차 금지. |
| 2026-09-15 | firestore-query-first-search | 활성 INTENT/STATE/DECISIONS는 Project 루트에 두고 작업 branch에 commit | Owner: 원격 Repository를 현재 상태 SSOT로. Secret/raw는 여전히 local-only. |
| 2026-09-15 | firestore-query-first-search | Live 순서 고정: indexes READY → search backfill → Hosting → smoke. PR/main 별도 | Owner live 창 승인. |
| 2026-09-15 | handoff-discipline | 작업 시작·재개 시 `README.md`부터 읽고 **먼저 원격 최신 상태로 sync한 뒤** 최신 `STATE.md`의 `다음 담당 / 다음 행동`을 기준으로 이어간다. stale local 상태로 Owner 승인 대기를 만들지 않는다. | 로컬이 원격보다 뒤처져 있으면 최신 Toby handoff를 놓쳐 엉뚱한 대기/반복 작업이 발생한다. |
| 2026-09-15 | handoff-discipline | Toby가 Owner에게 한 줄 재개 지시를 안내하기 전에는, 자신이 쓴 `STATE.md`가 해당 작업 branch에 commit/push 되었고 remote tip에서 실제로 보이는지 확인한다. | Owner가 긴 프롬프트 운반자가 되는 것을 막고 GitHub SSOT를 실제 통신 채널로 사용한다. |
| 2026-09-15 | handoff-discipline | 정상 동작 중인 기능은 함부로 수정하지 않는다. 불가피하게 수정하면 최소 범위로 하고 완료 보고에 `수정 파일 / 수정 함수·로직 / 수정 이유 / 기존 정상 기능 영향`을 반드시 적는다. | 이미 통과한 기능의 회귀와 원인 불명 변경을 방지한다. |
| 2026-09-19 | github-pages-preview | GitHub Pages는 `feature/firestore-place-ui` 미리보기. `vite --base=/DANGJEJU_2/`는 Pages workflow만. Firebase Hosting은 `vite build`(base `/`) 유지. Firebase web config는 Actions secrets. | 팀 공유용 미리보기와 운영 Hosting 경로를 분리한다. |
| 2026-09-19 | admin-place-editor-v1 | 관리자 판별은 `admins/{uid}`의 `role=admin`, `active=true`; Client는 자기 문서 read만 가능하고 관리자 문서 write는 금지한다. | 이메일/UID 하드코딩 없이 UI와 Firestore Rules를 같은 UID 권한 원천으로 묶는다. |
| 2026-09-19 | admin-place-editor-v1 | KTO Source는 immutable로 두고, 일반 표시값은 Place 서비스 field, KTO 전용 Pet 상세는 sparse `adminOverrides.petDetails`, 명시 삭제는 `manualAdmin.clearedFields`로 표현한다. | 관리자 보완 우선순위와 원천 provenance를 함께 보존하고 향후 Agent 후보 승인도 같은 저장 경로를 재사용한다. |
| 2026-09-19 | admin-place-editor-v1 | V1 이미지는 URL 입력/검증/preview까지만 포함하고 Storage 파일 업로드는 별도 승인으로 둔다. | Storage/Billing/Rules 운영 설정은 이번 승인 범위가 아니다. |
