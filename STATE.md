# STATE — 현재 작업 snapshot

> 일지가 아니다. **지금 재개에 필요한 최신 사실만** 남기고 교체한다.
> 완료된 상세 이력은 Git history 또는 아래 “근거 파일”에 두고, 여기서는 링크한다.
> STATE 자신의 Commit SHA를 매번 기록하지 않는다.

## 현재

- **WORK_ID:** firestore-query-first-search
- **목표 참조:** `PROJECT_INTENT.md` (Query-first; 전체 Catalog 선로딩 폐기)
- **Branch:** `feature/firestore-place-ui`
- **현재 단계:** **LIVE 적용 완료** (indexes READY → search backfill → Hosting → smoke PASS)
- **현재 담당:** Geni
- **다음 담당 / 다음 행동:** Owner 수락·추가 지시 대기. **PR·main merge는 하지 않음** (별도 지시 전)
- **Blocker:** 없음
- **LAST_UPDATED_BY:** Geni
- **Hosting:** https://dangjeju.web.app

## 완료된 사실

- Query-first offline 구현 + Hank/Ani offline PASS (이전)
- V2 SSOT: 루트 `PROJECT_INTENT.md` / `STATE.md` / `DECISIONS.md` / `AGENTS.md` commit. 구형 `BRIEF.md` 삭제 (재승인 금지)
- Firestore search composite indexes 배포 → **READY**
- `recompute.py --apply --confirm-project=dangjeju`: **2126**건 `search` write, `search.version==1` count=2126
- Hosting 재배포 완료
- Admin live smoke PASS (`private_probe/.../LIVE_SMOKE.json`): hero 5, WEST×CAFE sample, favorite resolve
- Browser smoke: 홈 추천 5곳 + 서부×카페 검색 44곳(Map=List) + 상세(미확인 안내) 확인
- unit: `node --test` 25 PASS, derive unittest PASS, lint/build PASS

## 핵심 계약

- `search.version=1`, `scoreVersion=hank-place-field-audit-v1`
- Hero: `totalScore >= 12`, limit 5
- Search: region × 8 category, `orderBy petSortKey DESC`
- Pet UNKNOWN 포함; **`listView` 없음**
- Favorites: favorite placeId만 getDoc
- Apply: ADC only, `--confirm-project=dangjeju`, quota 시 checkpoint 후 중단

## 관련 파일

- `tools/firestore_place_search_fields/` (README = recompute 절차, `live_smoke.py`)
- `src/lib/placeSearch.ts`, `src/hooks/usePlaceQueries.ts`, `firestore.indexes.json`
- Kit local: `agent-collab-kit/AGENTS.md`
