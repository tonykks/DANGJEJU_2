# STATE — 현재 작업 snapshot

> 일지가 아니다. **지금 재개에 필요한 최신 사실만** 남기고 교체한다.

## 현재

- **WORK_ID:** favorites-orphan-diag
- **목표 참조:** 기존 테스트 계정 Header 찜 수 과다 현상 — **read-only 진단만** (삭제/로직 변경 금지)
- **Branch:** `feature/firestore-place-ui`
- **현재 단계:** 진단 완료. 정리(orphan favorite 삭제)는 Owner 승인 전 미실시.
- **현재 담당:** Geni → Owner
- **다음 담당 / 다음 행동:** Owner가 정리 여부 결정. 찜 로직·삭제 작업은 지시 전 금지. PR/main 없음.
- **Blocker:** 없음. Auth email↔uid 매핑은 ADC Identity Toolkit 권한 불일치로 스킵(uid 기준 보고).
- **LAST_UPDATED_BY:** Geni

## 진단 결과 (Firestore collectionGroup `favorites`, read-only)

전체 favorite 문서 **6건 / uid 3명**. App `listFavorites`는 `data.placeId === doc.id`만 유지. Drawer는 `places/{id}` 존재하는 것만 resolve.

| uid (축약) | Header(=client IDs) | Drawer(resolve) | orphan (places 없음) | 전체 placeId |
|---|---:|---:|---|---|
| `uPh8zJNn…F2RE3` | **3** | **1** | `place-1`, `place-4` | `kto-3112168`, `place-1`, `place-4` |
| `ikdfwzJc…OLP2` | 2 | 2 | (없음) | `kto-3013283`, `kto-741109` |
| `b4Gw9OGx…Edy1` | 1 | 0 | `place-11` | `place-11` |

### 원인 해석
- Header가 크게 보이는 계정은 **구형 `place-*` ID favorite가 남아** `savedPlaceIds.length`에 포함되기 때문.
- Drawer는 해당 Place 문서가 없어 **더 적은 수**만 표시 → Header−Drawer 불일치.
- `kto-*`만 있는 계정은 Header=Drawer로 정상(새 계정 패턴과 일치).
- 존재 확인: `kto-3112168`/`kto-3013283`/`kto-741109` = places 있음; `place-1`/`place-4`/`place-11` = **없음**.

## 관련 파일

- `tools/favorites_orphan_diag/diagnose.py`
- Evidence(local): `private_probe/favorites_orphan_diag/DIAGNOSIS.json`
- 선행: Header count fix (`savedPlaceIds.length`)는 유지
