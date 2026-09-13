# DANGJEJU_2 — DB Schema Design Task

## 1. 목적

현재 확보한 KTO 제주 관광정보 + Pet JOIN 데이터를 최대한 살리면서,
기존 팀장이 반려견 사용자 입장에서 필요하다고 판단해 Web App에 설계해 둔 항목도 모두 보존하고,
향후 공공데이터·팀 조사·직접 조사·사용자 제보 등으로 점진적으로 채워갈 수 있는 **확장 가능한 DB Schema V1**을 설계한다.

Owner 원칙:

1. 기존 App의 유용한 항목은 지금 값이 없어도 버리지 않는다.
2. 현재 값이 없는 항목을 추측해서 채우지 않는다.
3. `false`와 `unknown`을 혼동하지 않는다.
4. UI에서는 값이 있는 정보만 보여주고, null/unknown을 빈칸으로 대량 노출하지 않는다.
5. 데이터가 추가될수록 화면 정보가 자연스럽게 풍부해지는 구조를 만든다.
6. 교육용 팀 Project 수준에 맞게 설계하되 미래 확장 여지는 남긴다.

---

## 2. 협업 역할

- **지니(Cursor)**: 총괄·작업 배정·최종 통합
- **행크(Codex Astra)**: DB Schema **주 설계자**. 적극 활용한다.
- **애니(agy / Gemini)**: 행크 설계안의 **독립 Review + 테스트/검증** 담당

이번 단계에서는 실제 DB 구축이나 App 연결을 하지 않는다.

---

## 3. 시작 전 Reading

지니는 로컬 Project의 현재 `agent-collab-kit` V2 기준 문서와 활성 상태 문서를 먼저 읽는다.
그 다음 아래 자료를 확인한다.

### 현재 데이터 분석 자료
- `private_probe/DATA_PROBE_REPORT.md`
- `private_probe/DATASET_INVENTORY_REPORT.md`
- `private_probe/DATA_USABILITY_REVIEW.md`
- `private_probe/20260911T143232Z/tables/jeju_pet_join.csv`
- 필요하면 같은 Run의 raw JSON

### 기존 Web App 구조
- `src/types.ts`
- `src/data/places.ts`
- `src/components/PlaceDetailModal.tsx`
- `PlaceCard`, `PlaceListItem`, `JejuMap` 등 장소정보 사용 Component

주의:
`src/data/places.ts`의 하드코딩 값은 실제 사실로 인정하지 않는다.
단, **팀장이 필요하다고 판단한 Field 목록과 UX 요구의 근거**로 적극 활용한다.

---

## 4. 확인된 현재 데이터 전제

- 제주 관광정보: **2,126건**
- 전국 Pet 정보: **9,689건**
- 제주 + Pet LEFT JOIN: **2,126건**
- 제주 Pet 매칭: **330건**
- 제주 Pet 미확인: **1,796건**

해석 원칙:

- 330건 = KTO Pet Dataset과 제주 관광정보의 교집합
- 1,796건 = Pet 불가가 아니라 **KTO Pet 정보 미확인**
- `contentId`는 Dataset 내 unique
- title / 주소 / 좌표는 unique key가 아님
- 동일 실제 장소가 서로 다른 `contentId` / `contentType`으로 존재할 수 있음
- Pet 상세 Field Coverage는 낮음
- 원천 오류/결측은 보존·표시하고 임의 보정하지 않음

---

## 5. 기존 App에서 반드시 보존할 미래 Field

### 장소 기본·운영정보
- 장소명
- 서비스 Category
- 지역 / 권역
- 한 줄 설명
- 상세 설명
- 주소 / 도로명 주소
- 좌표
- 주차정보
- 운영시간
- 휴무일
- 전화번호
- Instagram/SNS
- 대표 이미지
- Tags
- 추천 포인트

### Pet Policy
- 허용 견종/체급
- 소형견 / 중형견 / 대형견 가능 여부
- 크기/체중 제한 설명
- 실내 가능 여부
- 야외 가능 여부
- Carrier 필요 여부
- 공간 이용 정책 / 설명
- 목줄 필요 여부 / 설명
- Off-leash Zone 여부
- 반려견 입장료 / 설명
- 기타 Pet 정책

### Amenities
- 무료주차
- 주차 설명
- Dog Menu
- 물그릇 제공
- 배변봉투 제공
- Fenced Yard
- Photo Zone

### 기타
- 주의사항
- 추천 포인트
- Tags
- Event/Banner 정보

현재 값이 없으면 `unknown`/`null`로 두되, UI 기본 표시 대상에서는 제외할 수 있어야 한다.

---

## 6. Schema 설계 핵심 원칙

### A. KTO 원본 최대 보존
현재 UI에서 사용하지 않는 Field도 향후 의미가 있을 수 있으므로 가능한 한 원본 의미를 보존한다.

### B. 원본 Field와 서비스용 Field 분리
예:
- KTO `contentTypeId`
- KTO `lclsSystm*`
- 댕제주 서비스 Category

서로 덮어쓰지 않는다.

### C. Unknown 상태 명확화
`false`는 실제로 불가/없음을 의미한다.
정보가 없는 경우와 반드시 구분한다.
필요하면 `true / false / unknown` 또는 별도 status 구조를 사용한다.

### D. UI 노출 원칙 반영
DB에는 미래 Field가 있어도 된다.
화면은 값이 있고 신뢰 가능한 정보만 조건부 표시할 수 있어야 한다.

### E. Source Provenance
향후 다음 출처를 수용할 수 있어야 한다.
- KTO
- VisitJeju
- TeamResearch
- OwnerInput
- UserReport
- 기타 공공데이터

최소 추적 후보:
- source
- sourceId
- sourceUpdatedAt
- importedAt
- verifiedAt
- verificationStatus

### F. 미래 확장
자주 검색/필터할 핵심 정보는 정식 Field로 둔다.
용도가 확정되지 않은 새 속성은 `extraAttributes` 같은 제한적 확장 공간을 검토한다.
모든 것을 JSON 한 덩어리에 몰아넣지는 않는다.

### G. 동일 장소의 복수 contentId
현재 자동 병합하지 않는다.
필요하면 향후 `placeGroupId`, `parentPlaceId`, `relatedPlaceIds` 등으로 관계를 표현할 수 있도록 검토한다.

---

## 7. 행크(Astra)에게 맡길 일

행크가 1차 설계의 주 책임자다.

최소 수행 사항:

1. 현재 KTO 관측 Field 전체와 기존 App Field를 함께 inventory 한다.
2. 원본 Field / 서비스 Field / 향후 수집 Field를 구분한다.
3. 기술 중립적인 Logical Schema를 먼저 설계한다.
4. 그 뒤 Firestore 사용 시 자연스러운 Mapping 가능성을 별도로 검토한다.
5. Firestore를 이미 확정된 기술처럼 가정하지 않는다.
6. 과도한 정규화나 사업용 수준의 복잡성을 피한다.
7. Login/찜 기능을 고려해 `users` / `favorites`의 자리는 남기되 이번에는 구현하지 않는다.
8. Event/Banner는 장소 데이터와 성격이 다르므로 별도 Entity/Collection 후보로 검토한다.
9. 실제 Dataset의 2,126행을 기준으로 Schema가 적용 가능한지 샘플 Mapping을 확인한다.

참고 후보 Entity/Collection:
- places
- placeSources / sourceMetadata
- petPolicy
- amenities
- placeContent / descriptions
- events / banners
- users
- favorites

더 단순하고 좋은 구조가 있으면 근거를 제시하고 선택한다.

---

## 8. Field Mapping Matrix 필수

모든 주요 Field를 최소 다음 네 그룹으로 분류한다.

- **A**: 현재 실제 데이터로 채울 수 있음
- **B**: 현재 일부만 채울 수 있음
- **C**: 기존 App에는 필요하지만 현재 데이터 없음 — 향후 수집 대상
- **D**: 내부 관리 / 출처 / 검증용 Field

각 Field에는 최소 다음 열을 포함한다.

- Field name
- 한글 의미
- Entity/Collection
- Data type
- 현재 Source
- 현재 Coverage
- Null/Unknown 허용 여부
- 검색/Filter 사용 여부
- UI 표시 후보 여부
- 향후 수집 필요 여부
- 비고

---

## 9. 애니(agy) 독립 Review + 검증

행크 초안이 나온 뒤 애니가 별도로 검토한다.

최소 검증 항목:

1. 현재 KTO 관측 Field가 불필요하게 손실되지 않는가
2. 기존 App에서 중요하게 사용한 Field가 빠지지 않았는가
3. `unknown`과 `false`가 혼동되지 않는가
4. Source Provenance가 충분한가
5. 복수 `contentId` / 복합시설 문제를 처리할 여지가 있는가
6. 향후 Data Source 추가가 가능한가
7. 과도한 정규화/복잡성이 없는가
8. 교육용 팀 Project에 맞는 수준인가
9. Firestore로 구현할 경우 비현실적인 구조가 아닌가
10. UI가 값 없는 Field를 자연스럽게 숨길 수 있는가
11. 현재 2,126행 + 330 Pet 매칭 데이터를 넣었을 때 의미 왜곡이 없는가

가능하면 실제 `jeju_pet_join.csv`를 이용해 대표 레코드 몇 건을 Schema에 Mapping해 검증한다.

판정:
- PASS
- CONDITIONAL PASS
- REVISE

---

## 10. 최종 산출물

로컬 전용 경로에 작성한다.

`private_probe/schema_design/`

최소 산출물:
- `DB_SCHEMA_V1_DRAFT.md`
- `FIELD_MAPPING_MATRIX.csv`
- `SCHEMA_REVIEW_ANI.md`

권장:
- Mermaid ER Diagram 또는 관계도
- 대표 장소 3~5건의 sample mapping
- 필요하면 `SCHEMA_VALIDATION_REPORT.md`

Kit 규칙상 필요한 범위에서 활성 `STATE.md` / `DECISIONS.md`를 갱신한다.

---

## 11. 이번 단계에서 하지 않는 것

- Firebase Project 생성/설정
- Firestore 실제 Collection 생성
- DB Import
- App `src/` 수정
- UI 변경
- Login/Logout 구현
- 찜 기능 구현
- Raw Dataset 수정/삭제
- 기존 하드코딩 값을 실제 사실로 Import
- 배포
- `main` 직접 수정 또는 merge

Owner/Toby 승인 전에는 다음 단계로 넘어가지 않는다.

---

## 12. 완료 보고 형식

지니는 최종적으로 아래만 간단히 Owner에게 보고하고 멈춘다.

1. 행크(Astra) 1차 설계 완료 여부
2. 애니(agy) Review 판정
3. 최종 제안 Entity/Collection 목록
4. 현재 바로 채울 수 있는 Field 수
5. 일부만 채울 수 있는 Field 수
6. 향후 수집 대상 Field 수
7. Source / Unknown / 확장 구조 요약
8. 주요 설계 결정 5개 이내
9. 남은 쟁점
10. 다음 단계(DB 기술 선택/실제 구축 검토) 진행 가능 여부 YES/NO

**보고 후 중단한다. Owner와 Toby 승인 전 실제 DB 구축을 시작하지 않는다.**
