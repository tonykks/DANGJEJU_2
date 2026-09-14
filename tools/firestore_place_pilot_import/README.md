# Firestore Place Stage 1 Pilot

`dangjeju` 프로젝트의 `(default)` Firestore에 고정된 Place 20건과 Source 20건을 적재한다. 앱과 독립된 Python 도구다. 전체 2,126건을 적재하는 옵션은 없다.

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

원천은 `private_probe/20260911T143232Z/tables/jeju_pet_join.csv`다. SHA-256, 2,126행, 중복 없는 문자열 contentId, Y 330/N 1,796, JOIN 일관성을 검증한다. CSV 변경 시 중단한다.

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
