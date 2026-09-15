# STATE — 현재 작업 snapshot

> 일지가 아니다. **지금 재개에 필요한 최신 사실만** 남기고 교체한다.
> 완료된 상세 이력은 Git history 또는 아래 “근거 파일”에 두고, 여기서는 링크한다.
> STATE 자신의 Commit SHA를 매번 기록하지 않는다.

## 현재

- **WORK_ID:** firestore-query-first-search
- **목표 참조:** `PROJECT_INTENT.md` (Query-first; 전체 Catalog 선로딩 폐기)
- **Branch:** `feature/firestore-place-ui`
- **현재 단계:** LIVE 적용 직전 → **진행 중** (index 배포 → search backfill → Hosting → live smoke)
- **현재 담당:** Geni
- **다음 담당 / 다음 행동:**
  1. Firestore indexes 배포 및 READY 확인
  2. `tools/firestore_place_search_fields/recompute.py --apply` (`search`만)
  3. Hosting 재배포
  4. Live smoke (hero5 / region×category / favorites / detail)
  5. PR·main merge는 **하지 않음**
- **Blocker:** 없음(Owner live 창 승인됨). Quota 재발 시 즉시 중단·기록.
- **LAST_UPDATED_BY:** Geni

## 완료된 사실 (재개 시 다시 하지 말 것)

- Query-first **offline 구현 완료** (App + derive/recompute dry-run + indexes JSON)
- Hank 설계/기술 검토 반영 완료; Ani 독립 검토 **PASS**
  - Evidence(local): `private_probe/firestore_query_first/ANI_REVIEW.md`, `GENI_IMPL_NOTES.md`
- Offline dry-run: places=2126, hero `totalScore>=12` = 5
- 구형 `BRIEF.md` 제거 (V2 미사용). 내용은 INTENT/STATE/DECISIONS로 흡수. **BRIEF 재승인 금지**

## 핵심 계약

- `search.version=1`, `scoreVersion=hank-place-field-audit-v1`
- Hero: `totalScore >= 12`, limit 5
- Search: `region` × 8 `category`, `orderBy petSortKey DESC`, Map=List 동일 배열
- Pet UNKNOWN 포함; `listView` 없음
- Favorites: favorite placeId만 getDoc
- Snapshot dry-run sha256: `2b91c56fc7b5196bc828c9238081678ed31b26a21a318ac516580238a40ca35b`

## 관련 파일

- `PROJECT_INTENT.md`, `DECISIONS.md`
- `tools/firestore_place_search_fields/` (README = recompute 절차)
- `src/lib/placeSearch.ts`, `src/hooks/usePlaceQueries.ts`, `firestore.indexes.json`
- Kit local: `agent-collab-kit/` (AGENTS.md 원본)
