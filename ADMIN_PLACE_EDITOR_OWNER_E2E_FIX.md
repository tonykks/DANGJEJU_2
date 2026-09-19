# ADMIN_PLACE_EDITOR_OWNER_E2E_FIX — 2026-09-20

## 목적
Owner의 실제 GitHub Pages 관리자 화면에서 확인된 실패를 재현·원인 규명·최소 수정·재검증한다.

## 현재 기준
- Branch: `feature/firestore-place-ui`
- Entry Point: `agent-collab-kit/README.md`
- 현재 원격 최신 상태를 먼저 sync한 뒤 진행한다.
- 기존 admin-place-editor-v1의 정상 기능은 유지한다.
- 이미지 파일 업로드는 이번 수정 범위가 아니다. **이미지 URL 직접 입력 방식은 그대로 유지**한다.

## Owner 실제 E2E에서 확인된 현상

### A. 여러 Field 변경 확인 표시
Owner는 한 화면에서 여러 항목을 선택·입력했다.
예시로 확인된 항목은 한 줄 설명, 전화번호, 대표 이미지 URL 등이다.

그런데 `변경 확인` modal에서 실제 변경 내역이 예상보다 적게(한 항목만) 표시되는 현상이 관찰됐다.

**중요:** 이것을 즉시 코드 결함이라고 단정하지 말고,
1. 선택 상태,
2. `값 지우기` 상태,
3. 입력값과 현재 effective value의 동일 여부,
4. `buildAdminEditPlan()`의 `changes` 계산
을 재현해 정확한 원인을 확인한다.

Acceptance:
- 여러 Field에 실제 서로 다른 새 값을 입력하면 modal에 모든 실제 변경 Field가 표시된다.
- 여러 Field를 명시적으로 clear할 때 실제 기존값이 있는 Field는 모두 modal에 표시된다.
- 선택했지만 실제 값 변화가 없는 Field가 제외되는 경우, 사용자가 이유를 알 수 있도록 UI 피드백을 제공한다.
- 체크하지 않은 Field는 변경되지 않는다.
- 저장 전 modal과 실제 Firestore patch가 서로 일치한다.

### B. 실제 관리자 Place write가 Firestore Rules에서 거부됨
Owner가 관리자 화면에서 `확인하고 저장`을 실행했을 때 실제 운영 환경에서 다음 오류가 발생했다.

`Missing or insufficient permissions`

관리 버튼/관리자 route/검색까지는 실제 Owner 로그인 상태에서 정상 동작했다.
따라서 단순히 관리자 문서가 없는 것으로 추정하지 말고 **실제 요청 payload와 live document shape가 Rules 조건 중 어디에서 거부되는지** 확인한다.

필수 진단:
1. Owner 관리자 문서 `admins/{uid}`의 `role=admin`, `active=true`를 안전하게 재확인한다.
2. 실제 관리 UI가 생성하는 update payload를 동일하게 재현한다.
3. 가능하면 Owner가 선택한 실제 장소(화면의 "아우아우")의 현재 Place/Source 구조를 read-only로 확인한다.
4. 실제 문서 shape를 fixture로 삼아 Emulator에서 동일 payload를 admin auth로 실행해 Rules 거부를 재현한다.
5. Rules debug / 조건별 검증으로 **정확히 어느 조건이 false인지** 특정한다.
6. 실제 Rules 결함이면 최소 수정한다. 보안 allowlist를 넓혀서 우회하지 않는다.
7. Client payload 결함이면 Rules를 약화하지 말고 client를 수정한다.
8. 수정 후 실제 document shape 기반 Emulator test를 regression test로 추가한다.

## 검증
수정 후 최소한 아래를 통과시킨다.

- 여러 Field edit plan unit test
- 여러 Field clear plan unit test
- modal 표시와 patch 일치 test
- 실제 live document shape를 반영한 admin Rules Emulator update PASS
- 일반 사용자 Place update DENY
- Place create/delete DENY
- Source write DENY
- admins client write DENY
- favorites 기존 Rules 회귀 PASS
- lint
- 관련 Node tests
- Python search derivation tests
- Firebase/Pages production build
- agy CLI 독립 review + 동적 Rules 검증

## 운영 적용
- 실제 원인이 Rules라면 Emulator PASS 후 Firestore Rules를 운영 배포한다.
- frontend 수정이 있으면 feature branch push로 Pages 배포를 확인한다.
- Firebase Hosting에도 실제 frontend 변경이 필요하면 재배포한다.
- Firebase CLI가 logout 상태이므로 운영 배포 시 Owner의 정상 `firebase login`이 필요하면 그 로그인 절차만 요청한다. 새 credential/custom token/우회 인증은 만들지 않는다.
- 테스트용 운영 Place 수정은 최소·가역적으로 하고, 원래 값을 기록한 뒤 검증 후 즉시 복원한다.

## 하지 않는 것
- 이미지 파일 업로드/Storage 도입
- 새 Billing 활성화
- 새 계정/credential 생성
- KTO source 원문 수정
- PR/main merge
- 불필요한 전체 코드 재작성
- 정상 기능의 광범위한 수정

## 완료 조건
1. Owner 실제 관리자 계정으로 Place update가 성공한다.
2. 여러 Field를 동시에 변경하면 confirmation modal에 모든 실제 변경값이 표시된다.
3. 저장 후 사용자 화면에 반영된다.
4. 테스트용 변경은 원상복원 가능하고 실제 복원까지 확인한다.
5. agy 독립검증 PASS.
6. STATE.md 갱신, feature branch commit/push, 최종 SHA 보고.
