# ADMIN_PLACE_EDITOR_RULES_OPTIMIZATION — 2026-09-20

## 목적
관리 화면에서 허용된 여러 사용자 표시 Field를 한 번에 저장할 때도 Firestore Security Rules의 expression 한도에 걸리지 않도록 Rules와 검증 구조를 최적화한다.

## 현재 실제 실패
Owner가 GitHub Pages 관리자 화면에서 다음과 같은 다중 수정 조합을 실제 저장하려고 했을 때:
- 한 줄 설명
- 상세 설명
- 전화번호
- 대표 이미지 URL
- 보조 이미지 URL
- Instagram URL
- 주차 편의 상세

confirmation modal까지는 정상이나 최종 저장에서:
`Missing or insufficient permissions`
가 발생했다.

이전 실제 E2E는 다중 Field confirmation만 확인했고, 운영 DB 실제 저장은 한 줄 설명 1개만 수행했다. 따라서 "다중 Field 실제 저장"의 최악 조건 검증이 충분하지 않았다.

## 핵심 원칙
1. 이번 실패 원인을 **먼저 재현하고 확정**한다. expression 1000 한도를 가정만 하고 수정하지 않는다.
2. 실제 Owner가 방금 입력한 7-Field 조합을 동일하게 Emulator에서 재현한다.
3. 원인이 expression-limit이면 Firestore Rules를 최적화한다.
4. 보안을 약화하거나 allowlist/권한 조건을 넓혀 통과시키지 않는다.
5. 목표는 특정 7개 조합만 통과시키는 것이 아니라 **관리 화면에서 허용된 모든 사용자 수정 가능 Field를 한 번에 변경하는 최악의 경우까지 안전하게 통과**시키는 것이다.
6. 내부 Field(search.*, 점수, hash, provenance 등)는 사용자가 수정하지 않으며 기존 자동 파생/보호 계약을 유지한다.

## 최악 조건 Acceptance
Emulator에서 실제 live-shaped Place fixture를 사용해 다음을 검증한다.

### A. All-edit
관리 화면에서 수정 가능한 모든 user-visible Field에 유효한 새 값을 주고 한 번의 update/transaction으로 저장:
- PASS
- Rules expression-limit 미초과
- manualAdmin.changedFields / changedTopLevel / managedFields 정확
- search.* 자동 재계산/보호 유지
- KTO source 미수정

### B. Mixed edit/clear
허용된 clearable Field 일부는 명시 clear, 나머지는 edit:
- PASS
- clearedFields 정확
- fallback/override 의미 보존
- 비허용 clear는 계속 DENY

### C. Security regression
- 일반 사용자 Place update DENY
- admin Place create/delete DENY
- Source write DENY
- admins client write DENY
- protected/search tampering DENY
- favorites 기존 owner-only 계약 PASS

## 최적화 방향
- affectedKeys(), map access, keys()/toSet(), 반복 helper 호출 등 동일 계산을 local binding으로 재사용한다.
- 변경되지 않은 그룹은 불필요한 validation을 반복하지 않도록 affected group 기반 short-circuit를 검토한다.
- validManualAdmin / validPlaceDisplay / validSearch / nested validators 간 중복 계산을 줄인다.
- 단순히 validation을 제거해서 expression 수를 줄이지 않는다.
- 보안 의미는 현재 Rules와 동등하거나 더 엄격해야 한다.
- 필요하면 Rules helper 구조를 재배치하되 가독성과 테스트 가능성을 유지한다.

## UI 소규모 개선
이번 작업에 함께 포함해도 되는 최소 UX:
- 클릭 가능한 주요 버튼에 pointer cursor 적용
- `변경 확인`, `확인하고 저장`에 클릭/진행 상태가 시각적으로 분명하도록 기존 busy 상태를 활용
- 오류가 있으면 버튼이 안 먹는 것처럼 보이지 않도록 현재 오류 메시지 위치/표시를 개선
단, UI 전체 재설계는 하지 않는다.

## 검증
- 현재 실제 7-Field payload 재현 test
- All-edit worst-case test
- Mixed edit/clear worst-case test
- 기존 rules/security regression
- admin edit-plan tests
- lint
- Node/Python 관련 회귀
- Firebase/Pages production build
- agy CLI 독립 review + Emulator 동적검증

## 운영 적용
- Emulator와 agy 독립검증 PASS 후 Rules 변경이 있으면 live deploy
- frontend 변경이 있으면 Pages/Hosting에 필요한 배포 수행
- Making_Agent(Profile 9)의 Owner 로그인 browser를 사용해 실제 운영 E2E:
  1. 방금 실패한 7-Field 조합 저장
  2. 공개 화면 반영 확인
  3. 원래 값으로 전부 복원
  4. 복원 확인
- 모든 수정 가능 Field 전체를 운영 데이터에 실제 저장하는 테스트는 Emulator에서 충분히 검증하고, 운영에서는 위험을 줄이기 위해 방금 실패한 실제 7-Field 조합을 필수 E2E로 사용한다.

## 하지 않는 것
- 이미지 파일 업로드/Storage 도입
- Billing 변경
- 새 credential/custom token
- KTO source 수정
- PR/main merge
- 보안규칙 완화로 우회
- 정상 기능 광범위 재작성

## 완료 조건
1. 실제 7-Field 운영 저장이 성공한다.
2. All-edit worst-case Emulator test PASS.
3. Mixed edit/clear worst-case Emulator test PASS.
4. expression-limit 또는 다른 실제 거부 원인이 명확히 기록된다.
5. 보안 regression 전부 PASS.
6. agy 독립검증 PASS.
7. 운영 7-Field 값은 테스트 후 원상복원.
8. STATE.md 갱신, feature branch commit/push, 최종 SHA 보고.
