# Firestore Place Import — Stage 1 Pilot / Stage 2 Full

`dangjeju` 프로젝트의 `(default)` Firestore에 적재하는 앱과 독립된 Python 도구다. `import_pilot.py`는 고정된 Place 20건과 Source 20건만 적재한다. `import_full.py`는 같은 변환 함수를 사용해 지정 JOIN CSV의 모든 실제 행을 적재한다. 아래 Stage 1 절차는 그대로 유지하며, Stage 2 절차는 문서 마지막에 있다.

## 실행

저장소 루트에서 실행한다. Python 3.10 이상이 필요하며 이번 실행 환경은 Python 3.14다.

```powershell
python -m venv tools/firestore_place_pilot_import/.venv
& tools/firestore_place_pilot_import/.venv/Scripts/python.exe -m pip install -r tools/firestore_place_pilot_import/requirements.txt

# SDK 설치나 인증 없이도 가능. 최초 실행에서만 manifest를 생성한다.
python tools/firestore_place_pilot_import/import_pilot.py --dry-run --write-manifest

# 실제 적재 및 재실행: 실행할 때마다 새로운 결과 파일이 생성된다.
& tools/firestore_place_pilot_import/.venv/Scripts/python.exe tools/firestore_place_pilot_import/import_pilot.py --apply --favorites-count
& tools/firestore_place_pilot_import/.venv/Scripts/python.exe tools/firestore_place_pilot_import/import_pilot.py --apply --favorites-count

# 읽기 전용 재검증
& tools/firestore_place_pilot_import/.venv/Scripts/python.exe tools/firestore_place_pilot_import/import_pilot.py --verify --favorites-count

python -m unittest discover -s tools/firestore_place_pilot_import -p test_import_pilot.py -v
```

`--report-name NEW_NAME.json`으로 결과 파일 이름을 지정할 수 있다. 이미 존재하는 결과 파일은 덮어쓰지 않으며 쓰기 전에 중단한다. 결과 위치는 `private_probe/firestore_place_pilot_import/`다. 성공한 실제 적재의 마지막 stdout은 `HANK_PILOT_DONE`과 counts다. Dry-run은 `HANK_PILOT_DRY_RUN`, 읽기 전용 검증은 `HANK_PILOT_VERIFIED`로 구분한다. 실패 시 종료 코드 1이며 성공 마커를 출력하지 않는다.

## 인증과 범위

`firebase_admin.credentials.ApplicationDefault()`를 사용하고 프로젝트를 `dangjeju`로 명시한다. 기존 gcloud ADC를 사용한다. 이는 [Firebase Admin 초기화 문서](https://firebase.google.com/docs/admin/setup#initialize-sdk)에 따른 구성이다. `.env`, ADC 파일, 서비스 계정 키를 생성하거나 출력하지 않는다. `GOOGLE_APPLICATION_CREDENTIALS` 파일 override와 `FIRESTORE_EMULATOR_HOST`가 설정된 상태에서는 중단한다. 서비스 계정 키 기반 ADC도 거부한다.

허용하는 쓰기 경로는 아래 40개 고정 문서뿐이다.

- `places/kto-{contentId}`
- `places/kto-{contentId}/sources/kto-areaBasedList2-{contentId}`

`users`, `favorites`, `events`, `placeRelations`, `regionCodes`에 쓰지 않는다. 선택적 favorites 검사는 `collection_group('favorites').count()`만 수행하며 사용자 식별자나 문서 내용은 읽지 않는다. `src/`, 보안 규칙, Hosting 설정, 원천 파일을 수정하지 않는다.

## 선택과 원천 추적

원천은 `private_probe/20260911T143232Z/tables/jeju_pet_join.csv`다. SHA-256, 중복 없는 문자열 contentId, Y/N과 JOIN 일관성을 검증한다. 행 수와 Y/N 수는 CSV를 읽어 계산한다. 현재 원천은 2,126행, Y 330/N 1,796이며 이 수치를 적재 목표로 강제하지 않는다. CSV checksum 변경 시 중단한다.

먼저 스키마 §8의 6개 contentId를 포함했다. 나머지는 Y/N 각각 10건이 될 때까지 그룹 내 유형 수, 행정시 수, 행정시/유형 조합 수를 적은 순서로 비교하고 숫자 contentId로 동률을 해소해 선택했다. 선택 결과는 코드의 `PILOT_IDS`와 `PILOT_MANIFEST.json`으로 고정했다. 매번 재추첨하지 않는다. 제주시/서귀포시 각 10건, 7개 KTO 유형을 포함하며 모집단 비율을 대표하는 통계 표본은 아니다. 여기서 known은 KTO Pet 오버레이의 존재만 뜻한다.

CSV에 없는 `lclsSystm1/2/3`, `mlevel`은 같은 수집 실행의 `raw/areaBasedList2_ldong50_p*.json`에서 선택한 20개 contentId에 한해 보완한다. CSV/raw 공통 관측값은 전부 대조한다. Manifest에 보완 파일 경로, SHA-256, JSON Pointer를 저장하고 Source 문서에도 참조 문자열을 남긴다. 원천 전체 JSON을 문서에 복제하지 않는다.

`csvRecord`는 헤더를 제외한 1부터 시작하는 레코드 번호다. `physicalLineStart/End`는 헤더를 포함한 파일의 물리적 줄 번호다. Pet 텍스트에 실제 줄바꿈이 있어 둘은 같지 않다. Source의 `rawReference`에는 CSV 경로, 두 종류의 행 위치, contentId, SHA-256이 들어간다.

## 스키마 결정

- `placeId`는 서비스 식별자이고 KTO contentId와 개념상 별개다. 파일럿 초기 생성에 한해 `kto-{contentId}`를 결정적으로 사용한다.
- Place는 `petPolicy`, `amenities` map을 포함한다. 정책 TriState 15개는 모두 `UNKNOWN`, 미수집 텍스트·목록·금액은 `null`이다. Y도 `petAcceptance=UNKNOWN`이다.
- `has_pet=Y`는 `petPolicy.petInformationStatus=KTO_OVERLAY_FOUND`, N은 `UNKNOWN`이다. Pet 자유문은 `source.kto.pet`에서 접두사 없이 보존한다. 서비스 정책으로 추론하지 않는다.
- Source envelope는 `source=KTO`, 문자열 `sourceId=contentId`, `sourceDataset`, `sourceUpdatedAt`, `importedAt`, `verifiedAt=null`, `verificationStatus=UNVERIFIED`를 포함한다. 데이터셋은 Y일 때 `areaBasedList2+detailPetTour2`, N일 때 `areaBasedList2`다. `(source, sourceDataset, sourceId)` 20개가 모두 유일하다. 미래의 다른 출처 통합은 별도 설계가 필요하다.
- Source의 일반 문자열은 빈 문자열도 원문 그대로 보존한다. Place의 미관측 문자열만 null로 바꾼다. N의 `kto.pet=null`은 부재를 나타낸다.
- `address=addr1`이며 `addr2`는 Source에만 보존한다. `serviceCategory=null`, `regionArea=UNKNOWN`, `regionName=null`, `publicationStatus=DRAFT`다. Municipality만 법정동 110/130에서 변환한다.
- 영주산 경도 `12.79737228191`을 그대로 저장하고 `SOURCE_ANOMALY`로 표시한다. 좌표 QA는 위도 32.5–34.2, 경도 125.5–127.2의 넓은 제주/부속도서 범위 검사다. 행정구역 판정이나 좌표 보정은 아니다.
- 시간대 없는 KTO 14자리 등록/수정 시각은 **Asia/Seoul 가정**으로 UTC Instant로 변환한다. 가정은 Source의 `sourceTimestampTimezoneAssumption`에 명시한다. 원래 숫자 문자열은 `createdTimeText`, `modifiedTimeText`에 보존하며 좌표 문자열도 `mapxText`, `mapyText`에 보존한다.
- `evidenceSourceIds`는 Matrix의 검증된 근거 조건에 따라 아직 채우지 않는다. Source는 모두 UNVERIFIED이고 검증된 서비스 정책이 없다.
- 제주동화마을 두 contentId는 별개 문서다. PlaceRelation은 생성하지 않는다.

## 재실행과 충돌

모든 40개 문서를 읽고 검증한 뒤 한 트랜잭션에서 `set(..., merge=True)`한다. Firestore의 [Transaction.set](https://docs.cloud.google.com/python/docs/reference/firestore/latest/google.cloud.firestore_v1.transaction.Transaction#set) API를 사용한다. 기존 문서가 있으면 시각 필드 외 내용이 frozen payload와 일치해야 한다. 검증된 정책, 변경된 Source, 추가 필드 등 차이가 있으면 자동으로 덮어쓰지 않고 전체 트랜잭션을 중단한다.

재실행은 같은 40개 ID에 set한다. Place `createdAt`은 유지하고 `updatedAt`, Source `importedAt`은 서버 시각으로 갱신한다. 따라서 문서 ID와 의미 데이터는 idempotent하며 시간 메타데이터까지 byte 동일하다는 뜻은 아니다. 트랜잭션은 최대 3번 재시도한다. 별도 출처 하위 문서를 삭제하지 않는다.

저장 후 모든 문서를 다시 읽어 예상 payload와 비교하고 SHA-256, Place 전체 수, 파일럿 Place/Source 수, 파일럿 하위 Source 경로를 검사한다. 선택적 favorites count도 전후 비교한다. 동시 앱 활동으로 count가 바뀌면 검증 실패로 기록될 수 있으며 이를 importer 변경이라고 단정하지 않는다.

결과 보고 실패가 commit 이후 발생해도 자동 rollback/delete는 하지 않는다. 새 보고서 이름으로 `--verify`하여 현재 상태부터 확인한다. 성공한 commit 뒤에 count가 늘어난 경우에도 추가 적재나 삭제로 수치를 억지로 맞추지 않는다.

`private_probe/`는 이 저장소의 기존 로컬 ignore 대상이다. Manifest와 검증 산출물은 로컬에 남는다. Commit/Push는 Geni/Owner가 검토 후 담당한다.

## Stage 2 전체 가져오기

별도 entry `import_full.py`의 기본 범위는 전체 CSV다. `--full`은 같은 범위를 명시하는 선택적 플래그다. `build_plan(full=True)`가 Stage 1과 동일한 Place/Source 변환을 사용하며 CSV 레코드 순서와 raw 참조, 원천 hash를 보존한다. 숫자 contentId 순서로 처리하되 같은 이름/주소를 병합하지 않는다. Full manifest와 Stage 1 manifest는 따로 보관한다. 파일럿 manifest 및 기존 40개 의미 payload와의 동일성도 unit test에서 검사한다.

결과는 로컬 `private_probe/firestore_place_full_import/`에만 저장한다. 기존 SDK/venv와 ADC를 사용하므로 새 키/환경 파일이나 앱 의존성 변경이 필요 없다. 환경 변수 `GOOGLE_APPLICATION_CREDENTIALS` 또는 `FIRESTORE_EMULATOR_HOST`가 존재하면 빈 값이어도 중단한다. 서비스 계정 키 기반 ADC도 거부한다.

```powershell
# Offline 계획 생성. 기존 manifest/report는 덮어쓰지 않는다.
& tools/firestore_place_pilot_import/.venv/Scripts/python.exe tools/firestore_place_pilot_import/import_full.py --dry-run --write-manifest --report-name DRY_RUN.json

# 1. 읽기 전용 favorites 기준선
& tools/firestore_place_pilot_import/.venv/Scripts/python.exe tools/firestore_place_pilot_import/import_full.py --favorites-before

# 2–3. 실제 전체 적재 및 재실행
& tools/firestore_place_pilot_import/.venv/Scripts/python.exe tools/firestore_place_pilot_import/import_full.py --apply --report-name IMPORT_1.json
& tools/firestore_place_pilot_import/.venv/Scripts/python.exe tools/firestore_place_pilot_import/import_full.py --apply --report-name IMPORT_2.json

# 4. 동일 형식 스냅샷 및 byte/구조 비교
& tools/firestore_place_pilot_import/.venv/Scripts/python.exe tools/firestore_place_pilot_import/import_full.py --favorites-after

# 5. 전체 문서 재조회 및 A–J/cross-run 검증
& tools/firestore_place_pilot_import/.venv/Scripts/python.exe tools/firestore_place_pilot_import/import_full.py --verify --report-name VERIFY_FINAL.json

# 6. 파일럿과 전체 import 회귀 테스트
& tools/firestore_place_pilot_import/.venv/Scripts/python.exe -m unittest discover -s tools/firestore_place_pilot_import -p 'test_import*.py' -v

# 7. 선택적 앱 회귀 검사
npm run lint
npm run build
node --import tsx --test tests/favoritesSession.test.ts
```

### Favorites 증거

`collection_group('favorites').stream()`을 읽기 전용으로 실행한다. `users/{uid}/favorites/{placeId}` 경로, uid, placeId, createdAt, 전체 필드 키와 추가 필드 키 목록을 정렬해 보관한다. 추가 필드의 실제 값은 저장하지 않고, 원래 전체 문서의 타입을 구분한 SHA-256을 보관한다. 이메일 평문은 기록하지 않는다. uid는 로컬 비교 증거에만 있으며 stdout에 출력하지 않는다.

`createdAt`은 seconds/nanos로 표현한다. Firestore는 [시각을 마이크로초 정밀도로 저장](https://firebase.google.com/docs/firestore/manage-data/data-types)한다. Python SDK snapshot의 deepcopy가 `nanosecond=0`으로 돌려주는 경우에도 datetime의 microseconds를 사용해 저장 정밀도를 보존한다. 직접 받은 나노초 속성이 있으면 함께 보존한다.

BEFORE/AFTER 파일에는 실행 시각처럼 매번 달라지는 필드를 넣지 않아 원래 favorites가 같으면 파일 bytes도 동일하다. 전체 문서 집합 fingerprint는 경로/uid/placeId와 원문 문서 digest를 포함한다. `FAVORITES_COMPARE.json`은 개수, fingerprint, byte/구조 동등성을 기록한다. 다른 사용자의 동시 favorites 변경도 FAIL로 표시하며 importer가 원인이라고 단정하거나 원래 값으로 되돌리지 않는다.

### 청크·재시도·충돌

기본 200개 문서(Place/Source 100쌍), 마지막은 남은 쌍을 처리한다. `--chunk-docs`는 짝수 2–200만 허용한다. 모든 Place/Source 쌍의 ID와 쓰기 경로를 사전에 검사하며, pair는 같은 트랜잭션에 포함된다. JSON 기준 청크 6 MiB/개별 문서 750 KiB의 보수적 크기 제한도 검사한다.

첫 쓰기 전에 모든 기존 대상 문서를 읽고 의미 데이터와 필수 시각을 검사한다. 각 청크도 트랜잭션 안에서 다시 읽고 검사한 뒤 `set(merge=True)`한다. 확인된 정책/추가 필드/출처 변경 등 충돌은 중단 사유다. 기존 `createdAt`은 보존하고 `updatedAt`/`importedAt`은 서버 시각으로 갱신한다. 다른 Source를 삭제하지 않는다.

SDK 트랜잭션의 ABORTED 재시도는 최대 3회다. 별도로 ServiceUnavailable, DeadlineExceeded, InternalServerError, ResourceExhausted는 최대 3회 새 트랜잭션으로 재시도하며 대기 시간은 1/2초다. 상세 동작은 [Firestore 트랜잭션 문서](https://firebase.google.com/docs/firestore/manage-data/transactions)를 따른다. 커밋 후 응답 유실에도 같은 ID/의미값을 다시 쓰므로 중복 생성 없이 createdAt을 보존한다. 생성 수는 마지막 시도의 반환값이 아닌 실행 전후 inventory 차이로 계산한다. `setOperations`는 논리 대상 수이며 재시도로 시각 쓰기가 반복될 수 있다.

각 실행의 `*_JOURNAL.jsonl`에 청크 시작/응답 확인/재시도 상태를 즉시 flush/fsync한다. 청크 사이에는 원자성이 없다. 실패/강제 종료 시 앞 청크나 응답을 받지 못한 청크가 이미 저장되어 있을 수 있다. 자동 rollback/delete를 하지 않는다. 문제를 해결한 뒤 새 `--report-name RECOVERY_1.json`으로 같은 `--apply`를 재실행한다. 재실행 역시 전체 충돌 검사부터 수행하며 중복을 만들지 않는다. journal은 상태 증거이지 성공 문서를 무조건 건너뛰는 체크포인트가 아니다.

### 최종 검증 A–J

`--verify`는 전체 Places와 Source collection-group을 읽고 모든 대상 payload 및 ID 집합을 CSV 계획과 대조한다. A=원천 실제 행/해시, B=ID/전체 수, C=Y/N 상태, D=15개 TriState UNKNOWN, E=Source identity/provenance/원문, F=동명이인 별도 문서·대표 sample, G=시각 보존/갱신, H=재실행 무증가, I=favorites 동등, J=보호 파일 해시다.

이 완료 검증은 성공한 `IMPORT_1.json`, `IMPORT_2.json`, favorites 세 파일과 `PROTECTED_FILES_BEFORE.json`을 필요로 한다. 보호 기준선은 실행 전에 보호 대상 상대 경로→SHA-256 JSON으로 별도 기록한다. 실패한 import의 현재 상태만 확인하려는 `--verify`는 완료 조건이 부족하면 FAIL 보고서를 남기며 쓰지는 않는다. 증거 파일을 덮어쓰거나 실패를 PASS로 바꾸지 않는다.

각 apply의 마커는 `HANK_FULL_APPLIED`, 읽기 전용 검증은 `HANK_FULL_VERIFIED`다. 요청한 전체 작업 완료 마커 `HANK_FULL_DONE places=... sources=... known=... unknown=... favorites_unchanged=true`는 favorites 비교·A–J 검증·unit/app 검사 결과까지 확인한 후 출력한다.
