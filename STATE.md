# STATE — 현재 작업 snapshot

> 일지가 아니다. **지금 재개에 필요한 최신 사실만** 남기고 교체한다.

## 현재

- **WORK_ID:** detail-modal-tab-reset
- **목표 참조:** Place 상세 팝업 오픈 시 항상 첫 탭「반려동물 정보」
- **Branch:** `feature/firestore-place-ui`
- **현재 단계:** 수정·Hosting 재배포·live 확인 완료
- **현재 담당:** Geni
- **다음 담당 / 다음 행동:** Owner 수락. PR/main 없음. (favorites orphan 정리는 별도 Owner 지시)
- **Blocker:** 없음
- **LAST_UPDATED_BY:** Geni
- **Hosting:** https://dangjeju.web.app

## 완료된 사실

- `PlaceDetailModal`: `useEffect([isOpen, place?.id])`로 오픈/장소 변경 시 `activeTab='policy'` 리셋. 팝업 내 탭 전환은 유지.
- lint PASS, `node --test` 27 PASS, build PASS
- Live: 카페에벤에셀 → tips 탭 → 닫기 → 아우아우 오픈 → 정착 후「반려동물 정보」탭 확인
- 선행: Header savedCount=`savedPlaceIds.length`; favorites orphan 진단은 정리 대기

## 관련 파일

- `src/components/PlaceDetailModal.tsx`
- `tests/detailModalTabReset.test.ts`, `tests/placeUi.test.mjs`
