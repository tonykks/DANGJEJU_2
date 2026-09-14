import PlaceImage from './PlaceImage';
import React from 'react';
import { Place } from '../types';
import { MapPin, Heart, ChevronRight } from 'lucide-react';

interface PlaceListItemProps {
  key?: string;
  place: Place;
  isSelected: boolean;
  isSaved: boolean;
  onSelect: (place: Place) => void;
  onToggleSave: (placeId: string) => void;
  onOpenDetail: (place: Place) => void;
}

const CATEGORY_STYLES: Record<string, { label: string; badgeClass: string }> = {
  cafe: { label: '카페', badgeClass: 'bg-orange-100 text-orange-800' },
  spot: { label: '관광', badgeClass: 'bg-purple-100 text-purple-800' },
  food: { label: '식당', badgeClass: 'bg-rose-100 text-rose-800' },
  trail: { label: '산책', badgeClass: 'bg-emerald-100 text-emerald-800' },
  stay: { label: '숙소', badgeClass: 'bg-blue-100 text-blue-800' },
};

export default function PlaceListItem({
  place,
  isSelected,
  isSaved,
  onSelect,
  onToggleSave,
  onOpenDetail,
}: PlaceListItemProps) {
  const cat = CATEGORY_STYLES[place.category] || {
    label: '명소',
    badgeClass: 'bg-slate-100 text-slate-800',
  };

  const handleClick = () => {
    onSelect(place);
    onOpenDetail(place);
  };

  return (
    <div
      id={`place-list-row-${place.id}`}
      onClick={handleClick}
      className={`group w-full bg-white rounded-xl border transition-all duration-150 cursor-pointer flex items-center px-3 py-2.5 sm:py-2 gap-2.5 sm:gap-4 hover:bg-amber-50/40 hover:border-amber-300 hover:shadow-2xs ${
        isSelected
          ? 'border-amber-500 bg-amber-50/30 ring-1 ring-amber-400'
          : 'border-slate-200/90'
      }`}
    >
      {/* 1. Slim Square Thumbnail */}
      <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-slate-200/60">
        <PlaceImage
          place={place}
          alt={place.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
        <span
          className={`absolute bottom-0 inset-x-0 text-center py-0.2 text-[9px] font-black backdrop-blur-xs ${cat.badgeClass}`}
        >
          {cat.label}
        </span>
      </div>

      {/* 2. Main Title & Region Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <h4 className="text-xs sm:text-sm font-black text-slate-900 group-hover:text-amber-600 transition-colors truncate tracking-tight">
            {place.name}
          </h4>
          
          <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-0.5 shrink-0">
            <MapPin className="w-3 h-3 text-amber-500 shrink-0" />
            <span>{place.regionName}</span>
          </span>
        </div>

        <p className="text-[11px] text-slate-500 line-clamp-1 font-medium mt-0.5">
          {place.shortDesc}
          <span className="md:hidden"> · {place.petInformationLabel}</span>
        </p>
      </div>

      <div className="hidden md:flex items-center shrink-0">
        <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${place.petInformationStatus === 'KTO_OVERLAY_FOUND' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>{place.petInformationLabel}</span>
      </div>

      {/* 5. Quick Actions: Bookmark & Chevron */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          id={`bookmark-row-btn-${place.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSave(place.id);
          }}
          className={`p-1.5 rounded-lg transition-all ${
            isSaved
              ? 'text-rose-500 bg-rose-50'
              : 'text-slate-300 hover:text-rose-500 hover:bg-slate-100'
          }`}
          title="찜하기"
        >
          <Heart className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
        </button>

        <div className="p-1 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all">
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}
