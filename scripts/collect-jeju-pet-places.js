import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. API 키 확인
const serviceKey = process.env.TOUR_API_KEY;

if (!serviceKey) {
  console.error('\n❌ [오류] TOUR_API_KEY 환경변수가 설정되어 있지 않습니다.');
  console.error('해결 방법:');
  console.error('1) 프로젝트 루트의 .env 파일에 아래와 같이 추가하거나:');
  console.error('   TOUR_API_KEY=발급받은_공공데이터_인증키');
  console.error('2) 명령줄에서 직접 키를 전달하여 실행할 수 있습니다:');
  console.error('   TOUR_API_KEY=발급받은키 npm run collect:pet\n');
  process.exit(1);
}

// 동시 요청 제한 (최대 6개 동시 실행)
const CONCURRENCY_LIMIT = 6;
// 공공데이터 API 공통 파라미터
const BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';

async function fetchJson(endpoint, queryParams) {
  const params = new URLSearchParams({
    serviceKey: serviceKey,
    MobileOS: 'WEB',
    MobileApp: 'DANGJeju',
    _type: 'json',
    ...queryParams,
  });

  const url = `${BASE_URL}/${endpoint}?${params.toString()}`;
  const response = await fetch(url);
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`JSON 파싱 실패 (status: ${response.status})`);
  }
}

async function run() {
  console.log('====================================================');
  console.log('🐶 [댕제주] 제주 반려동물 동반 장소 전체 수집 시작');
  console.log('====================================================\n');

  // [1단계] 제주특별자치도(areaCode=39) 전체 관광지 목록 수집
  console.log('1단계: 제주 관광지 전체 목록(areaBasedList2) 조회 중...');

  // 1-1. 전체 건수 파악을 위한 1페이지 1건 조회
  const initData = await fetchJson('areaBasedList2', {
    areaCode: '39',
    pageNo: '1',
    numOfRows: '1',
    arrange: 'A',
  });

  const sourceTotalCount = Number(initData?.response?.body?.totalCount || 0);
  console.log(`- 제주특별자치도 전체 등록 관광지 수: ${sourceTotalCount}개\n`);

  if (sourceTotalCount === 0) {
    console.error('❌ 관광지 목록을 불러오지 못했습니다. API 키 또는 네트워크를 확인해주세요.');
    process.exit(1);
  }

  // 1-2. 100개 단위로 모든 페이지 수집
  const pageSize = 100;
  const totalPages = Math.ceil(sourceTotalCount / pageSize);
  let allPlaces = [];

  for (let page = 1; page <= totalPages; page++) {
    process.stdout.write(`  목록 가져오는 중... [페이지 ${page}/${totalPages}]\r`);
    const pageData = await fetchJson('areaBasedList2', {
      areaCode: '39',
      pageNo: String(page),
      numOfRows: String(pageSize),
      arrange: 'A',
    });

    const items = pageData?.response?.body?.items?.item;
    if (items) {
      const arr = Array.isArray(items) ? items : [items];
      allPlaces.push(...arr);
    }
  }

  console.log(`\n✅ 전체 관광지 기본 정보 수집 완료: 총 ${allPlaces.length}개\n`);

  // [2단계] 각 장소별 detailPetTour2 조회 및 반려동물 정보 병합
  console.log('2단계: 각 장소별 반려동물 정보(detailPetTour2) 확인 시작');
  console.log(`- 동시 요청 제한: 최대 ${CONCURRENCY_LIMIT}개 병렬 처리\n`);

  const matchedPlaces = [];
  let checkedCount = 0;
  let failedCount = 0;

  async function checkPlace(place) {
    const contentId = place.contentid ? String(place.contentid) : '';
    const title = place.title ? String(place.title) : '이름 없음';

    if (!contentId) {
      checkedCount++;
      return;
    }

    try {
      const petData = await fetchJson('detailPetTour2', {
        contentId: contentId,
      });

      const petBody = petData?.response?.body;
      const petTotalCount = Number(petBody?.totalCount || 0);
      const petItems = petBody?.items?.item;

      let petInfo = null;
      if (petTotalCount > 0 && petItems) {
        petInfo = Array.isArray(petItems) ? petItems[0] : petItems;
      } else if (petItems) {
        petInfo = Array.isArray(petItems) ? petItems[0] : petItems;
      }

      checkedCount++;

      // 진행 상황 콘솔 출력 (30건 단위 또는 반려동물 장소 발견 시)
      if (checkedCount % 30 === 0 || checkedCount === allPlaces.length) {
        console.log(`[${checkedCount}/${allPlaces.length}] 확인 중... (현재 발견: ${matchedPlaces.length}곳)`);
      }

      // 반려동물 동반 정보가 실제 존재하는 경우만 병합하여 저장
      if (petInfo) {
        console.log(`  🐾 반려동물 장소 발견: [${title}] (ID: ${contentId})`);

        matchedPlaces.push({
          contentId: contentId,
          title: place.title ? String(place.title) : null,
          address: place.addr1 ? String(place.addr1) : '',
          detailAddress: place.addr2 ? String(place.addr2) : '',
          image: place.firstimage ? String(place.firstimage) : '',
          thumbnail: place.firstimage2 ? String(place.firstimage2) : '',
          longitude: place.mapx ? parseFloat(place.mapx) : null,
          latitude: place.mapy ? parseFloat(place.mapy) : null,
          contentTypeId: place.contenttypeid ? String(place.contenttypeid) : '',
          cat1: place.cat1 ? String(place.cat1) : '',
          cat2: place.cat2 ? String(place.cat2) : '',
          cat3: place.cat3 ? String(place.cat3) : '',
          sigunguCode: place.sigungucode ? String(place.sigungucode) : '',

          // 반려동물 상세 필드 (요청 규격 100% 반영)
          petType: petInfo.acmpyTypeCd || '',
          petAllowed: petInfo.acmpyPsblCpam || '',
          petNeed: petInfo.acmpyNeedMtr || '',
          petInfo: petInfo.etcAcmpyInfo || '',
          petRisk: petInfo.relaAcdntRiskMtr || '',
          petFacilities: petInfo.relaPosesFclty || '',
          petProvidedItems: petInfo.relaFrnshPrdlst || '',
          petPurchaseItems: petInfo.relaPurcPrdlst || '',
          petIndoorInfo: petInfo.relaIntLrdl || '',
        });
      }
    } catch (err) {
      checkedCount++;
      failedCount++;
      // 개별 실패로 전체 스크립트 중단 방지
    }
  }

  // 동시성 제한(배치) 실행
  for (let i = 0; i < allPlaces.length; i += CONCURRENCY_LIMIT) {
    const batch = allPlaces.slice(i, i + CONCURRENCY_LIMIT);
    await Promise.all(batch.map((place) => checkPlace(place)));
  }

  // [3단계] 수집 결과를 JSON 파일로 저장
  console.log('\n3단계: 최종 데이터 JSON 파일 저장 중...');
  const outputDir = path.resolve(__dirname, '../src/data');
  const outputPath = path.join(outputDir, 'jeju-pet-places.json');

  // 디렉터리 존재 여부 확인 후 저장
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(matchedPlaces, null, 2), 'utf8');

  console.log('\n====================================================');
  console.log('🎉 [댕제주] 제주 반려동물 동반 장소 수집 완료!');
  console.log('====================================================');
  console.log(`- 전체 제주 관광지 수: ${sourceTotalCount}개`);
  console.log(`- 확인 완료 수: ${checkedCount}개`);
  console.log(`- 반려동물 정보가 있는 장소 수: ${matchedPlaces.length}개`);
  console.log(`- 실패한 요청 수: ${failedCount}개`);
  console.log(`- 저장 완료 파일: src/data/jeju-pet-places.json`);
  console.log('====================================================\n');
}

run().catch((err) => {
  console.error('\n❌ 스크립트 실행 중 치명적인 오류가 발생했습니다:', err);
  process.exit(1);
});
