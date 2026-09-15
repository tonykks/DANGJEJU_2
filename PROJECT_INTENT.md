# PROJECT_INTENT — Owner 의도 (단일 기준)

> Project 시작 때 확정한다. 매 작은 작업마다 다시 쓰지 않는다.
> Agent는 이 문서를 구현 세부가 아니라 **왜 / 무엇을 / 무엇은 하지 않는지**의 기준으로 읽는다.

## Owner 의도 요약 (한국어로 먼저 확인)

제주에서 반려견과 갈 수 있는 장소를 쉽게 찾고, 로그인 사용자별 즐겨찾기를 쓸 수 있는 웹 서비스(댕제주)를 만든다.
현재 활성 작업은 Firestore **Query-first** 전환이다: 시작 시 전체 Catalog(~2126 Place)를 읽지 않고, 지역×장소유형 조건으로만 조회한다.

## 목적

- KTO 기반 Place 데이터를 안전하게 서비스에 노출한다.
- 검색·지도·추천·즐겨찾기가 과도한 Firestore read 없이 동작한다.
- Pet 정보 미확인 장소도 결과에서 제외하지 않되, 확인된 장소를 우선 보여 준다.

## 하는 일

- Firebase Auth(Google) + Firestore + Hosting 기반 웹앱 유지·개선
- Place `search.*` 파생필드 기반 hero / region×category 검색 / favorites ID resolve
- Deterministic `search` recompute(문서화·도구화). 데이터 보완 후 점수·등급 재계산 가능
- Security Rules·indexes를 필요한 범위에서만 유지

## 하지 않는 일

- `listView` 등 Place 중복 사본 구조 신설
- 전체 Catalog 선로딩 경로 복원
- KTO Source 원문 덮어쓰기 / 무단 Full Import / Rules 추측 확장
- PR·main merge (Owner가 따로 지시하기 전)
- Secret·credential·raw probe dump를 Public에 커밋

## 성공 기준

1. 홈: Map + 오른쪽 추천목록 유지, `search.totalScore >= 12` 대표 최대 5개 (placeId 하드코딩 없음)
2. 검색: 지역(4) × 장소유형(8) 조건으로 필요 Place만 조회, Map·목록 동일 배열
3. Pet UNKNOWN 포함 + pet 풍부도 우선 정렬
4. Favorites는 찜 placeId만 조회
5. Live: indexes READY → `search` backfill → Hosting → smoke PASS

## 중요 제약 / 승인 범위

- Query-first 구현·live 적용(index / search backfill / Hosting / smoke)은 Owner가 승인함 (BRIEF 재승인 불필요; V2는 BRIEF 미사용)
- `search`만 update. Source·KTO 원문·favorites 스키마 변경 금지
- Firestore quota 고갈 시 반복 호출 금지 → Local/Offline 검증 유지, 상태 기록 후 보고
- PR/main merge는 별도 Owner 지시 전 금지

## 운영 환경 (제품 연결 — 역할과 분리)

- **주 IDE / Geni 역할 담당:** Cursor Native Agent (Geni)
- **사용 가능한 Agent / CLI:** Cursor Task, Codex CLI(Hank), agy(Ani), Firebase CLI, gcloud ADC
- **사용 가능한 Provider:** Cursor / Codex (`gpt-6-astra` 등) / Gemini(agy)
- **Git 사용:** 예
- **제품/코드 Repository (Public):** `tonykks/DANGJEJU_2`
- **Agent 소통 Repository:** 동일 Public repo의 작업 branch에 **최소 STATE/INTENT/DECISIONS**만 둔다 (Owner 지시: 원격 SSOT). Secret·raw dump·긴 audit는 `private_probe/`(local-only) 또는 kit 로컬
- **소통 branch:** `feature/firestore-place-ui`
- **Kit 경로:** `agent-collab-kit/` (local-only clone; 활성 INTENT/STATE/DECISIONS 원본은 **Project 루트**)
- **Firebase project:** `dangjeju` / Hosting https://dangjeju.web.app

## 의도 확인 메모 (필요할 때만)

- Owner override: Hank 초안 `listView` **만들지 않음**. 기존 Place 필드 + `search.*`만 사용.
- V2: `BRIEF.md` 폐기. 과거 BRIEF에 있던 승인 내용은 이 INTENT + `STATE.md` + `DECISIONS.md`로 흡수함 (재승인 절차 없음).
