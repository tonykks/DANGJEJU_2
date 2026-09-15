# STATE — 현재 작업 snapshot

> 일지가 아니다. **지금 재개에 필요한 최신 사실만** 남기고 교체한다.

## 현재

- **WORK_ID:** favorites-orphan-cleanup
- **목표 참조:** 기존 테스트 계정의 Header 찜 숫자와 Drawer 실제 찜 장소 수 불일치 해결
- **Branch:** `feature/firestore-place-ui`
- **현재 단계:** 원인 확정, orphan 데이터 정리 대기
- **현재 담당:** Geni
- **다음 담당 / 다음 행동:** 아래 orphan 3건을 재확인 후 정확히 일치하면 삭제하고, Header/Drawer 수 일치 및 기존 정상 찜 기능을 재검증한다. PR/main 없음.
- **Blocker:** 없음
- **LAST_UPDATED_BY:** Toby
- **Hosting:** https://dangjeju.web.app

## 원인 확정

현재 로그인/로그아웃/찜 추가/삭제/재로그인 복원 로직은 정상이다. 새 계정에서는 찜 추가·삭제·복원이 정상 동작한다.

기존 테스트 계정에 현재 `places/{placeId}`가 존재하지 않는 구형 `place-*` favorite 문서가 남아 있어 Header는 raw favorite ID 수를 세고, Drawer는 실제 존재하는 장소만 보여 숫자가 불일치했다.

확인된 orphan:

- `uPh8zJNnFXV5JNfLmtsBllwF2RE3 / place-1`
- `uPh8zJNnFXV5JNfLmtsBllwF2RE3 / place-4`
- `b4Gw9OGxuZWez3DhdG7pVDCxEdy1 / place-11`

정상 favorite:

- `uPh8zJNnFXV5JNfLmtsBllwF2RE3 / kto-3112168`
- `ikdfwzJckAZxx7wLg81lCaa8OLP2 / kto-3013283`
- `ikdfwzJckAZxx7wLg81lCaa8OLP2 / kto-741109`

## 이번 작업 원칙

1. 정상 동작하는 로그인/로그아웃/찜 추가/삭제/재로그인 복원 로직은 수정하지 않는다.
2. Query-first 구조와 이미 완료된 상세 팝업 첫 탭 리셋 기능도 수정하지 않는다.
3. 위 orphan 3건이 삭제 직전에도 실제 `places/{placeId}`가 없는지 다시 확인한다.
4. 정확히 orphan이 맞을 때만 위 3개 favorite 문서만 삭제한다.
5. 정상 `kto-*` favorite는 절대 변경하지 않는다.
6. 데이터 정리만으로 문제가 해결되면 source code는 변경하지 않는다.
7. 코드 변경이 불가피할 경우 최소 범위만 수정하고, 완료 보고에 반드시 `수정 파일 / 수정 함수 또는 로직 / 수정 이유 / 기존 정상 기능 영향`을 명시한다.

## Acceptance

- `uPh8zJNfLmtsBllwF2RE3` 계정: Header `1` / Drawer `1`
- `ikdfwzJckAZxx7wLg81lCaa8OLP2` 계정: Header `2` / Drawer `2`
- `b4Gw9OGxuZWez3DhdG7pVDCxEdy1` 계정: Header `0` / Drawer `0`
- 새 계정에서 찜 추가 시 Header/Drawer 모두 +1
- 찜 삭제 시 Header/Drawer 모두 -1
- 로그아웃 후 재로그인 시 해당 계정의 정상 찜 목록이 그대로 복원
- 다른 계정의 찜과 섞이지 않음
- 정상 기능 회귀 없음

## 완료된 사실

- 상세 팝업은 새로 열 때 항상 첫 탭「반려동물 정보」로 시작하도록 수정 및 live 확인 완료. 더 이상 손대지 않는다.
- Header 찜 숫자 표시 자체는 `savedPlaceIds.length`로 표시되도록 수정 완료.
- orphan 원인은 read-only 진단으로 확정됨.
