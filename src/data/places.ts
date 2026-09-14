import type { RegionInfo } from '../types';

export const REGIONS: RegionInfo[] = [
  { id: 'all', name: '전체', subName: '제주 전역', description: '제주도 전역의 관광 장소' },
  { id: 'jeju_city', name: '제주시', subName: '도심/공항', description: '공항 인근, 도심 공원, 카페와 음식점' },
  { id: 'seogwipo', name: '서귀포시', subName: '남부 휴양', description: '중문, 천지연, 칠십리공원, 감귤밭' },
  { id: 'east', name: '동부', subName: '구좌·조천·성산', description: '세화·함덕 해변, 비자림 숲길, 섭지코지' },
  { id: 'west', name: '서부', subName: '애월·한림·대정', description: '애월 오션뷰, 협재 바다, 송악산, 카멜리아힐' },
];
