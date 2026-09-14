import { useState, useMemo, useEffect, useRef } from 'react';
import { PLACES, REGIONS } from './data/places';
import { Place, RegionId, PlaceCategory, EventBanner } from './types';
import Header from './components/Header';
import PlaceCard from './components/PlaceCard';
import PlaceListItem from './components/PlaceListItem';
import PlaceDetailModal from './components/PlaceDetailModal';
import JejuMap from './components/JejuMap';
import SavedPlacesDrawer from './components/SavedPlacesDrawer';
import LoadingScreen from './components/LoadingScreen';
import EventBannerSlider from './components/EventBannerSlider';
import { useAuthFavorites } from './hooks/useAuthFavorites';
import { 
  Coffee, 
  MapPin, 
  UtensilsCrossed, 
  Trees, 
  BedDouble, 
  Compass, 
  Dog, 
  Calendar,
  Sparkles
} from 'lucide-react';

const CATEGORIES: { id: PlaceCategory; name: string; icon: any }[] = [
  { id: 'all', name: '전체보기', icon: Compass },
  { id: 'cafe', name: '카페·베이커리', icon: Coffee },
  { id: 'spot', name: '관광지·체험', icon: MapPin },
  { id: 'food', name: '음식점·식당', icon: UtensilsCrossed },
  { id: 'trail', name: '산책로·해변', icon: Trees },
  { id: 'stay', name: '숙소·펜션', icon: BedDouble },
];

export default function App() {
  // Loading screen state
  const [isLoading, setIsLoading] = useState(true);

  // Region and Category selection
  const [selectedRegion, setSelectedRegion] = useState<RegionId>('all');
  const [selectedCategory, setSelectedCategory] = useState<PlaceCategory>('all');

  // Place selection & Modals
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [modalPlace, setModalPlace] = useState<Place | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSavedDrawerOpen, setIsSavedDrawerOpen] = useState(false);

  // Concise View Modes: 'split' (분할뷰 - 기본), 'list' (목록만), 'map' (지도만)
  const [viewMode, setViewMode] = useState<'split' | 'list' | 'map'>('split');

  // Event modal state for slide banners
  const [activeBanner, setActiveBanner] = useState<EventBanner | null>(null);

  const {
    user, authLoading, authBusy, notice, dismissNotice, login, logout,
    savedPlaceIds, toggleSavePlace, favoritesLoading, favoritesError,
    pendingIds, refreshFavorites,
  } = useAuthFavorites();
  const saveNotice = notice ?? favoritesError ?? (pendingIds.length > 0 ? '찜 변경을 저장하고 있습니다…' : null);

  // Filter places based on 5 regions & categories
  const filteredPlaces = useMemo(() => {
    return PLACES.filter((place) => {
      if (selectedRegion !== 'all' && place.region !== selectedRegion) {
        return false;
      }
      if (selectedCategory !== 'all' && place.category !== selectedCategory) {
        return false;
      }
      return true;
    });
  }, [selectedRegion, selectedCategory]);

  const savedPlacesList = useMemo(() => {
    return PLACES.filter((p) => savedPlaceIds.includes(p.id));
  }, [savedPlaceIds]);

  const handleOpenDetail = (place: Place) => {
    setSelectedPlace(place);
    setModalPlace(place);
    setIsModalOpen(true);
  };

  // Reset to initial home state
  const handleResetHome = () => {
    setSelectedRegion('all');
    setSelectedCategory('all');
    setSelectedPlace(null);
    setModalPlace(null);
    setIsModalOpen(false);
    setIsSavedDrawerOpen(false);
    setViewMode('split');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cardSectionRef = useRef<HTMLDivElement>(null);
  const mapSectionRef = useRef<HTMLDivElement>(null);
  const [isNearMap, setIsNearMap] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (!mapSectionRef.current) return;
      const rect = mapSectionRef.current.getBoundingClientRect();
      setIsNearMap(rect.top < window.innerHeight * 0.65);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleToggleMobileMap = () => {
    if (isNearMap) {
      cardSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      mapSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#fbf9f5] text-slate-800 flex flex-col font-sans antialiased selection:bg-amber-100 selection:text-amber-900">
      
      {/* 1. 개 아이콘 로딩 화면 */}
      {isLoading && (
        <LoadingScreen onLoaded={() => setIsLoading(false)} minDuration={1200} />
      )}

      {/* Header */}
      <Header
        savedCount={savedPlaceIds.length}
        onOpenSaved={() => setIsSavedDrawerOpen(true)}
        onReloadLoading={() => setIsLoading(true)}
        onResetHome={handleResetHome}
        user={user}
        authLoading={authLoading}
        authBusy={authBusy}
        onLogin={login}
        onLogout={logout}
      />

      {saveNotice && (
        <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[3000] w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-amber-200 bg-white p-4 shadow-lg text-sm text-slate-700">
          <p>{saveNotice}</p>
          <div className="flex items-center justify-end gap-3 mt-2 text-xs font-bold">
            {!user && !authLoading && (
              <button onClick={login} disabled={authBusy} className="text-amber-700 disabled:opacity-50">Google로 로그인</button>
            )}
            {user && favoritesError && (
              <button onClick={refreshFavorites} disabled={authBusy || pendingIds.length > 0} className="text-amber-700 disabled:opacity-50">찜 목록 다시 불러오기</button>
            )}
            {notice && <button onClick={dismissNotice} className="text-slate-500">닫기</button>}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 flex flex-col gap-5">
        
        {/* 2. 슬라이드 형식 특별 이벤트 배너 */}
        <section>
          <EventBannerSlider onBannerClick={(banner) => setActiveBanner(banner)} />
        </section>

        {/* 3. 여행 지역 선택 (전체, 제주시, 서귀포시, 동부, 서부) */}
        <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-amber-100/90 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 text-white text-xs font-black flex items-center justify-center shadow-xs">
                1
              </span>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                여행 지역 선택
              </h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              5대 권역 바로보기
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {REGIONS.map((reg) => {
              const isActive = selectedRegion === reg.id;
              const count = reg.id === 'all'
                ? PLACES.length
                : PLACES.filter((p) => p.region === reg.id).length;

              return (
                <button
                  key={reg.id}
                  id={`region-select-btn-${reg.id}`}
                  onClick={() => setSelectedRegion(reg.id)}
                  className={`relative p-3 rounded-2xl text-left transition-all duration-200 border flex flex-col justify-between overflow-hidden group ${
                    isActive
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm scale-[1.02]'
                      : 'bg-[#faf8f5] hover:bg-amber-50/70 border-slate-200/80 text-slate-700 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black tracking-tight">{reg.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        isActive
                          ? 'bg-amber-400 text-slate-950 shadow-xs'
                          : 'bg-white text-slate-500 border border-slate-200/70'
                      }`}
                    >
                      {count}곳
                    </span>
                  </div>
                  <span
                    className={`text-[11px] font-medium mt-1.5 line-clamp-1 ${
                      isActive ? 'text-slate-300' : 'text-slate-400'
                    }`}
                  >
                    {reg.subName}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 4. 장소 유형 선택 (카테고리) */}
        <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-amber-100/90 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 text-white text-xs font-black flex items-center justify-center shadow-xs">
                2
              </span>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                장소 유형 선택
              </h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              테마별 모아보기
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = selectedCategory === cat.id;

              return (
                <button
                  key={cat.id}
                  id={`cat-select-btn-${cat.id}`}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`p-3 rounded-2xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 border ${
                    isActive
                      ? 'bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-500/20'
                      : 'bg-[#faf8f5] border-slate-200/80 hover:border-amber-300 text-slate-700 hover:bg-amber-50/50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 5. 결과 바 & 간결한 뷰 전환 (분할 / 목록 / 지도) */}
        <div className="flex items-center justify-between px-1 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-xs sm:text-sm font-bold text-slate-700">
              <span className="text-amber-600 font-black">{filteredPlaces.length}곳</span>의 반려견 동반 장소
            </p>
          </div>

          {/* 간략하고 깔끔한 3가지 뷰 세그먼트: [ 분할 ] [ 목록 ] [ 지도 ] */}
          <div className="inline-flex p-1 bg-slate-200/80 rounded-xl">
            <button
              id="view-toggle-split"
              onClick={() => setViewMode('split')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                viewMode === 'split'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              분할
            </button>
            <button
              id="view-toggle-list"
              onClick={() => setViewMode('list')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              목록
            </button>
            <button
              id="view-toggle-map"
              onClick={() => setViewMode('map')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                viewMode === 'map'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              지도
            </button>
          </div>
        </div>

        {/* 6. 메인 콘텐츠 뷰 */}
        <div className="pb-16">
          {viewMode === 'split' ? (
            /* 2열 구조: PC에서는 지도 약 65% (좌) + 목록 약 35% (우) 동일 고정 높이, 모바일에서는 자연스러운 세로 스택 */
            <div className="flex flex-col lg:flex-row lg:h-[720px] xl:h-[760px] 2xl:h-[800px] gap-4 lg:gap-5 items-stretch">
              
              {/* [PC: 좌측 65% 지도 / 모바일: 하단 지도] */}
              <div 
                ref={mapSectionRef}
                className="order-2 lg:order-1 w-full lg:w-[65%] shrink-0 h-[400px] sm:h-[460px] lg:h-full rounded-3xl overflow-hidden shadow-sm border border-amber-200/70 bg-white relative flex flex-col"
              >
                {/* 모바일 지도 헤더 바 */}
                <div className="lg:hidden bg-slate-900 text-white px-4 py-2.5 text-xs font-black flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    <span>제주 반려견 여행 지도 ({filteredPlaces.length}곳)</span>
                  </div>
                  <button
                    onClick={() => cardSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
                    className="text-[11px] text-amber-300 hover:text-amber-200 font-bold"
                  >
                    카드 목록으로 ↑
                  </button>
                </div>
                <div className="flex-1 min-h-0 relative">
                  <JejuMap
                    places={filteredPlaces}
                    selectedPlace={selectedPlace}
                    onSelectPlace={(p) => setSelectedPlace(p)}
                    onOpenDetail={handleOpenDetail}
                  />
                </div>
              </div>

              {/* [PC: 우측 35% 목록 / 모바일: 상단 카드 목록] */}
              <div 
                ref={cardSectionRef}
                className="order-1 lg:order-2 w-full lg:w-[35%] min-w-0 lg:h-full flex flex-col min-h-0"
              >
                {/* PC 상단 목록 정보 헤더 (고정) */}
                <div className="hidden lg:flex items-center justify-between pb-2.5 mb-2 border-b border-slate-200/80 px-1 shrink-0">
                  <div className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                    <Dog className="w-4 h-4 text-amber-500" />
                    <span>추천 여행지 <strong className="text-amber-600">{filteredPlaces.length}곳</strong></span>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">스크롤하여 둘러보기</span>
                </div>

                {/* 모바일 화면 상단 간편 지도 바로가기 버튼 */}
                <div className="lg:hidden flex items-center justify-between px-3 py-2 bg-amber-50/90 rounded-2xl border border-amber-200/70 text-xs font-bold shadow-2xs mb-3 shrink-0">
                  <span className="flex items-center gap-1.5 text-slate-700">
                    <Dog className="w-4 h-4 text-amber-500" />
                    <span>추천 명소 <strong>{filteredPlaces.length}곳</strong></span>
                  </span>
                  <button
                    onClick={handleToggleMobileMap}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs shadow-xs active:scale-95 transition-all"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>지도 보기</span>
                  </button>
                </div>

                {/* 관광지 목록 영역: 35% 영역 안에서만 매끄럽게 세로 스크롤 (카드는 절대 압축되지 않고 읽기 좋은 크기 유지) */}
                <div className="flex-1 min-h-0 lg:overflow-y-auto lg:pr-2 flex flex-col gap-3 scrollbar-thin">
                  {filteredPlaces.length === 0 ? (
                    <div className="bg-white rounded-3xl p-10 text-center border border-amber-100 shadow-2xs">
                      <Dog className="w-12 h-12 mx-auto text-amber-300 mb-3" />
                      <h3 className="text-base font-extrabold text-slate-800">
                        선택한 조건의 장소가 없습니다
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        지역이나 장소 유형을 다른 옵션으로 선택해보세요.
                      </p>
                      <button
                        onClick={() => {
                          setSelectedRegion('all');
                          setSelectedCategory('all');
                        }}
                        className="mt-4 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition-colors shadow-sm"
                      >
                        전체 장소 보기
                      </button>
                    </div>
                  ) : (
                    filteredPlaces.map((place) => (
                      <PlaceCard
                        key={place.id}
                        place={place}
                        isSelected={selectedPlace?.id === place.id}
                        isSaved={savedPlaceIds.includes(place.id)}
                        onSelect={(p) => setSelectedPlace(p)}
                        onToggleSave={toggleSavePlace}
                        onOpenDetail={handleOpenDetail}
                      />
                    ))
                  )}
                </div>
              </div>

            </div>
          ) : viewMode === 'list' ? (
            /* 목록 단독 모드: 전체 너비 목록 */
            <div className="w-full flex flex-col gap-2">
              {filteredPlaces.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-amber-100 shadow-2xs">
                  <Dog className="w-12 h-12 mx-auto text-amber-300 mb-3" />
                  <h3 className="text-base font-extrabold text-slate-800">선택한 조건의 장소가 없습니다</h3>
                  <button
                    onClick={() => {
                      setSelectedRegion('all');
                      setSelectedCategory('all');
                    }}
                    className="mt-4 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs"
                  >
                    전체 장소 보기
                  </button>
                </div>
              ) : (
                filteredPlaces.map((place) => (
                  <PlaceListItem
                    key={place.id}
                    place={place}
                    isSelected={selectedPlace?.id === place.id}
                    isSaved={savedPlaceIds.includes(place.id)}
                    onSelect={(p) => setSelectedPlace(p)}
                    onToggleSave={toggleSavePlace}
                    onOpenDetail={handleOpenDetail}
                  />
                ))
              )}
            </div>
          ) : (
            /* 지도 단독 모드: 전체 너비 지도 */
            <div className="w-full h-[620px] lg:h-[760px] rounded-3xl overflow-hidden shadow-sm border border-amber-200/70 bg-white">
              <JejuMap
                places={filteredPlaces}
                selectedPlace={selectedPlace}
                onSelectPlace={(p) => setSelectedPlace(p)}
                onOpenDetail={handleOpenDetail}
              />
            </div>
          )}
        </div>

      </main>

      {/* 모바일 전용 플로팅 지도/목록 스위처 버튼 */}
      {viewMode === 'split' && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 lg:hidden pointer-events-none">
          <button
            onClick={handleToggleMobileMap}
            className="pointer-events-auto flex items-center gap-2 px-5 py-3 rounded-full bg-slate-900 text-white font-black text-xs shadow-2xl shadow-slate-900/40 border border-slate-700/60 hover:scale-105 active:scale-95 transition-all"
          >
            <MapPin className="w-4 h-4 text-amber-400" />
            <span>{isNearMap ? '📋 카드 목록 위로' : `🗺️ 지도 위치 보기 (${filteredPlaces.length})`}</span>
          </button>
        </div>
      )}

      {/* 장소 상세조건 팝업 모달 */}
      <PlaceDetailModal
        place={modalPlace}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        isSaved={modalPlace ? savedPlaceIds.includes(modalPlace.id) : false}
        onToggleSave={toggleSavePlace}
      />

      {/* 이벤트 배너 상세 팝업 */}
      {activeBanner && (
        <div className="fixed inset-0 z-[2200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-amber-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="relative h-44 rounded-2xl overflow-hidden mb-4 bg-slate-900">
              <img
                src={activeBanner.imageUrl}
                alt={activeBanner.title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="absolute bottom-3 left-4 right-4 text-white">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-white/25 backdrop-blur-md text-white border border-white/30 mb-1.5 inline-block">
                  {activeBanner.badge}
                </span>
                <h3 className="text-lg font-black text-white drop-shadow-sm">{activeBanner.title}</h3>
                <p className="text-xs text-white/90 line-clamp-1">{activeBanner.subtitle}</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              {activeBanner.date && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50">
                  <Calendar className="w-4 h-4 text-amber-600" />
                  <span className="font-bold">행사 기간:</span>
                  <span>{activeBanner.date}</span>
                </div>
              )}
              {activeBanner.location && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50">
                  <MapPin className="w-4 h-4 text-rose-500" />
                  <span className="font-bold">행사 장소:</span>
                  <span>{activeBanner.location}</span>
                </div>
              )}
              {activeBanner.tag && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 text-amber-900">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <span className="font-bold">특징:</span>
                  <span>{activeBanner.tag}</span>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setActiveBanner(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 찜한 장소 서랍 */}
      <SavedPlacesDrawer
        isOpen={isSavedDrawerOpen}
        onClose={() => setIsSavedDrawerOpen(false)}
        savedPlaces={savedPlacesList}
        isSignedIn={Boolean(user)}
        isLoading={authLoading || favoritesLoading}
        authBusy={authBusy}
        error={favoritesError}
        pendingIds={pendingIds}
        onLogin={login}
        onRetry={refreshFavorites}
        onRemove={toggleSavePlace}
        onSelect={(p) => {
          setSelectedPlace(p);
          setModalPlace(p);
          setIsModalOpen(true);
        }}
      />
    </div>
  );
}
