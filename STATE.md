# STATE — 현재 작업 snapshot

> 일지가 아니다. **지금 재개에 필요한 최신 사실만** 남기고 교체한다.

## 현재

- **WORK_ID:** favorites-orphan-cleanup
- **목표 참조:** orphan favorite 정리로 Header/Drawer 찜 수 일치
- **Branch:** `feature/firestore-place-ui`
- **현재 단계:** **정리 완료** (전체 재검사 → orphan 3건 삭제 → 재검사 orphan 0)
- **현재 담당:** Geni → Owner
- **다음 담당 / 다음 행동:** Owner가 로그인 계정으로 Header=Drawer 수·추가/삭제/재로그인 수락 확인. PR/main 없음.
- **Blocker:** 없음 (에이전트 브라우저 Google 팝업 차단 — 데이터 검증은 Admin ADC로 완료)
- **LAST_UPDATED_BY:** Geni
- **Hosting:** https://dangjeju.web.app (앱 코드 변경 없음, 재배포 불필요)

## 정리 결과

삭제 직전 전체 재검사: favorites **8**건 / orphan **3**건.

| 삭제 path |
|---|
| `users/b4Gw9OGxuZWez3DhdG7pVDCxEdy1/favorites/place-11` |
| `users/uPh8zJNnFXV5JNfLmtsBllwF2RE3/favorites/place-1` |
| `users/uPh8zJNnFXV5JNfLmtsBllwF2RE3/favorites/place-4` |

삭제 후 재검사: favorites **5**건 / orphan **0**.

| uid | Header(=IDs) | Drawer(=존재하는 place) | 남은 placeId |
|---|---:|---:|---|
| `b4Gw9OGx…Edy1` | 2 | 2 | `kto-2626708`, `kto-3401751` |
| `ikdfwzJc…OLP2` | 2 | 2 | `kto-3013283`, `kto-741109` |
| `uPh8zJNn…F2RE3` | 1 | 1 | `kto-3112168` |

- 정상 `kto-*` favorite는 전부 유지.
- 앱 source / 찜 로직 / Query-first / 상세 탭 리셋: **미변경**.

## 이번 원칙 준수

1. 찜 로직 미수정  
2. Query-first·탭 리셋 미수정  
3. 고정 3건만 삭제하지 않고 전체 재검사 후 삭제  
4. orphan = `places/{placeId}` 없음  
5. 확인된 orphan만 삭제  
6. 정상 kto favorite 미변경  
7. 데이터 정리만으로 해결 → source 미변경  

## 관련 파일

- `tools/favorites_orphan_diag/cleanup.py`, `README.md`
- Evidence(local): `private_probe/favorites_orphan_diag/CLEANUP_SCAN_BEFORE.json`, `CLEANUP_SCAN_AFTER.json`
