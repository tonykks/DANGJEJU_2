# STATE — 현재 작업 snapshot

> 재개 Entry Point: `agent-collab-kit/README.md`. Kit AGENTS → 루트 INTENT/STATE 순서로 읽고 원격 sync 후 남은 작업만 진행한다.

## 현재

- **WORK_ID:** admin-place-editor-v1
- **목표 참조:** 관리자만 접근 가능한 장소 데이터 수정 V1. 사용자 화면에 표시되는 장소정보를 업체 검색 → 복수 Field 선택 → 일괄 수정/저장할 수 있게 한다.
- **Branch:** `feature/firestore-place-ui`
- **요구사항 기준:** 루트 `requirement.md`
- **현재 단계:** 요구사항 확정 및 원격 반영 완료. 구현 시작 전.
- **현재 담당 / LAST_UPDATED_BY:** Toby, 2026-09-19
- **다음 담당 / 다음 행동:** Codex 확장 채팅의 Hank가 Reading Protocol 수행 → 원격 sync → `requirement.md` 기준 구현. Codex CLI를 주 구현, agy CLI를 독립 Review/검증에 사용.
- **Blocker:** 없음. 단, Firestore Rules live deploy / 초기 관리자 등록 / 신규 Firebase Storage·Billing 설정은 이번 구현 완료 후 Owner/Toby 별도 승인 전 실행 금지.
- **Hosting (기존 운영, 보존):** https://dangjeju.web.app
- **Pages (feature preview):** https://tonykks.github.io/DANGJEJU_2/

## 현재 정상 baseline — 회귀 금지

- Firebase Authentication Google 로그인/로그아웃 정상.
- 사용자별 favorites `users/{uid}/favorites/{placeId}` 정상.
- Firestore Query-first 검색, 대표 최대 5개, 지역 4 × 장소유형 8, Map/목록/상세 정상.
- KTO Source 원문 보존.
- GitHub Pages 배포 성공. Pages 전용 `/DANGJEJU_2/` base 유지.
- Firebase Hosting은 이번 작업에서 재배포하지 않는다.
- PR/main merge 금지.

## 이번 V1 핵심 Acceptance

1. 관리자 UID 기반 권한 판별.
2. 관리자에게만 Header의 `관리` 버튼 노출.
3. 비관리자는 직접 URL 접근해도 수정 불가.
4. 업체명 검색은 전체 2,126개 선로딩 없이 수행.
5. 선택 장소의 현재 사용자 표시정보 전체 확인.
6. 여러 수정 Field 체크 → 선택 Field만 한 화면에서 편집 → 한 번에 저장.
7. 내부값(`placeId`, `search.*`, score/hash/time/provenance 등)은 수정 UI에 노출하지 않음.
8. 사용자 표시정보는 모두 수정 가능하되 KTO Source 원문은 덮어쓰지 않음.
9. 필요한 search 파생값은 자동 재계산.
10. 이미지 URL 입력/미리보기 지원. 파일 업로드는 신규 비용/중요 설정 없을 때만 포함.
11. 기존 로그인/찜/검색/지도/상세/두 배포환경 회귀 없음.
12. Codex CLI 구현 + agy 독립 Review/검증.
13. 완료 후 STATE 갱신, commit/push, 최종 SHA 보고 후 중단.

## 범위 밖

- 자동 공공데이터/웹 수집 Agent
- Scheduler
- Event/Banner 관리
- 새 Place 생성/삭제
- KTO Source 수정
- 전체 Catalog 선로딩 복원
- Owner 승인 없는 운영 Rules deploy / 관리자 등록 / Storage·Billing 활성화
- PR/main merge

## handoff

Owner는 Codex 확장 채팅에 짧은 재개 지시만 전달하면 된다. 상세 요구사항은 원격 `requirement.md`가 기준이다.
