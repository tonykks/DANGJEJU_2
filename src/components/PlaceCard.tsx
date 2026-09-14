import PlaceImage from './PlaceImage';
import React from 'react';
import { Place } from '../types';
import { MapPin, Heart, ChevronRight } from 'lucide-react';

interface PlaceCardProps {
  key?: string;
  place: Place;
  isSelected: boolean;
  isSaved: boolean;
  onSelect: (place: Place) => void;
  onToggleSave: (placeId: string) => void;
  onOpenDetail: (place: Place) => void;
}

const CATEGORY_STYLES: Record<string, { label: string; badgeClass: string; icon: string }> = {
  cafe: { label: '카페', badgeClass: 'bg-orange-500 text-white', icon: '☕' },
  spot: { label: '관광지', badgeClass: 'bg-purple-500 text-white', icon: '🎡' },
  food: { label: '음식점', badgeClass: 'bg-rose-500 text-white', icon: '🍽️' },
  trail: { label: '산책로', badgeClass: 'bg-emerald-600 text-white', icon: '🌿' },
  stay: { label: '숙소', badgeClass: 'bg-blue-600 text-white', icon: '🏡' },
};

export default function PlaceCard({
  place,
  isSelected,
  isSaved,
  onSelect,
  onToggleSave,
  onOpenDetail,
}: PlaceCardProps) {
  const cat = CATEGORY_STYLES[place.category] || {
    label: '명소',
    badgeClass: 'bg-slate-700 text-white',
    icon: '📍',
  };

  const handleCardClick = () => {
    onSelect(place);
  };

  const handleDetailClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(place);
    onOpenDetail(place);
  };

  return (
    <div
      id={`place-card-${place.id}`}
      onClick={handleCardClick}
      style={{ flexShrink: 0 }}
      className={`group relative bg-white rounded-2xl border transition-all duration-200 overflow-hidden cursor-pointer flex flex-row p-3 gap-3 shrink-0 flex-shrink-0 min-h-[144px] sm:min-h-[150px] hover:shadow-md hover:-translate-y-0.5 ${
        isSelected
          ? 'border-amber-500 ring-2 ring-amber-400/40 shadow-md bg-amber-50/20'
          : 'border-slate-200/90 hover:border-amber-300 shadow-2xs'
      }`}
    >
      {/* 1. Left Thumbnail Section (가로형 고정 썸네일 - 절대 압축되지 않음) */}
      <div className="relative w-28 sm:w-32 h-[126px] sm:h-[132px] shrink-0 flex-shrink-0 self-center rounded-xl overflow-hidden bg-slate-100">
        <PlaceImage
          place={place}
          alt={place.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

        {/* Category Badge on top-left of photo */}
        <div className="absolute top-2 left-2">
          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black shadow-xs flex items-center gap-0.5 ${cat.badgeClass}`}>
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
          </span>
        </div>

        {/* Bookmark Heart Button on top-right of photo */}
        <button
          id={`bookmark-card-btn-${place.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSave(place.id);
          }}
          className={`absolute top-2 right-2 p-1.5 rounded-full backdrop-blur-md transition-all shadow-xs ${
            isSaved
              ? 'bg-rose-500 text-white scale-105'
              : 'bg-white/90 text-slate-700 hover:bg-white hover:text-rose-500'
          }`}
          title="찜하기"
        >
          <Heart className={`w-3.5 h-3.5 ${isSaved ? 'fill-current' : ''}`} />
        </button>

        {/* Region & Off-leash indicator on bottom of photo */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1 text-white text-[10px] font-bold drop-shadow-md">
          <MapPin className="w-3 h-3 text-amber-300 shrink-0" />
          <span className="truncate">{place.regionName}</span>
          {place.petPolicy.offLeashZoneAvailable && (
            <span className="ml-auto px-1.5 py-0.2 rounded bg-teal-500 text-white text-[9px] font-black">
              오프리쉬
            </span>
          )}
        </div>
      </div>

      {/* 2. Right Information Section (모든 정보가 압축 없이 여유롭게 노출) */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          {/* Header: Title & Address */}
          <div className="flex items-start justify-between gap-1">
            <h4 className="text-sm sm:text-base font-black text-slate-900 group-hover:text-amber-600 transition-colors leading-snug line-clamp-1 tracking-tight">
              {place.name}
            </h4>
          </div>

          <p className="text-[11px] text-slate-400 mt-0.5 truncate flex items-center gap-1">
            <span className="truncate">{place.roadAddress || place.address}</span>
          </p>

          <div className="mt-2 flex flex-wrap gap-1">
            <span className={`rounded-md border px-1.5 py-0.5 text-[10px] sm:text-[11px] font-bold ${place.petInformationStatus === 'KTO_OVERLAY_FOUND' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
              {place.petInformationLabel}
            </span>
          </div>
        </div>

        {/* Footer: 한 줄 소개 & 상세보기 버튼 */}
        <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between gap-1.5">
          <p className="text-[11px] text-slate-500 truncate font-medium flex-1">
            {place.shortDesc}
          </p>
          <button
            onClick={handleDetailClick}
            className="inline-flex items-center gap-0.5 text-[11px] font-black text-amber-600 hover:text-amber-700 shrink-0 whitespace-nowrap group-hover:translate-x-0.5 transition-transform bg-amber-50/80 px-2 py-0.5 rounded-lg border border-amber-200/50"
          >
            <span>상세보기</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
