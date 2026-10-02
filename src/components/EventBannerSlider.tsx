import { useState, useEffect, useRef } from 'react';
import { EventBanner } from '../types';
import { JEJU_DOG_EVENTS } from '../data/banners';
import { ChevronLeft, ChevronRight, ArrowUpRight, Pause, Play } from 'lucide-react';

interface EventBannerSliderProps {
  onBannerClick?: (banner: EventBanner) => void;
}

export default function EventBannerSlider({ onBannerClick }: EventBannerSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const autoPlayRef = useRef<NodeJS.Timeout | null>(null);

  const banners = JEJU_DOG_EVENTS;

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  };

  // Auto-play effect
  useEffect(() => {
    if (isPlaying) {
      autoPlayRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % banners.length);
      }, 5000);
    }
    return () => {
      if (autoPlayRef.current) clearInterval(autoPlayRef.current);
    };
  }, [isPlaying, banners.length]);

  const current = banners[currentIndex];

  return (
    <div 
      className="relative w-full rounded-2xl sm:rounded-3xl overflow-hidden shadow-md border border-slate-200/80 group select-none cursor-pointer"
      onClick={() => onBannerClick?.(current)}
      onMouseEnter={() => setIsPlaying(false)}
      onMouseLeave={() => setIsPlaying(true)}
    >
      {/* Photo Slide Container */}
      <div className="relative w-full h-64 sm:h-72 md:h-80 overflow-hidden bg-slate-900">
        {/* Photos Layer with Smooth Transitions */}
        {banners.map((b, idx) => (
          <div
            key={b.id}
            className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
              idx === currentIndex ? 'opacity-100 z-10 scale-100' : 'opacity-0 z-0 scale-105 pointer-events-none'
            }`}
            style={{ transitionProperty: 'opacity, transform', transitionDuration: '800ms' }}
          >
            <img
              src={b.imageUrl}
              alt={b.title}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            {/* Cinematic Gradient Overlays for High Legibility */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />
          </div>
        ))}

        {/* Minimalist Key Text Overlay */}
        <div className="relative z-20 h-full p-5 sm:p-7 md:p-8 flex flex-col justify-between text-white">
          
          {/* Top Bar: Sleek Badge & Slide Pill */}
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 rounded-full text-[11px] font-black tracking-widest uppercase bg-white/20 backdrop-blur-md text-white border border-white/30 shadow-xs">
              {current.badge}
            </span>

            {/* Slide Index and Play/Pause */}
            <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-white/90 border border-white/10">
              <span className="text-amber-400">0{currentIndex + 1}</span>
              <span className="text-white/40">/</span>
              <span>0{banners.length}</span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPlaying(!isPlaying);
                }}
                className="ml-1 text-white/70 hover:text-white transition-colors"
                title={isPlaying ? '일시 정지' : '자동 재생'}
              >
                {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* Bottom Bar: Bold Headline, Crisp Subtitle & CTA */}
          <div className="space-y-2 max-w-2xl">
            <h3 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-white drop-shadow-md leading-tight">
              {current.title}
            </h3>

            <p className="text-xs sm:text-sm text-white/90 font-medium line-clamp-1 sm:line-clamp-2 leading-relaxed drop-shadow-xs">
              {current.subtitle}
            </p>

            {/* Quick Action Button & Tag */}
            <div className="pt-2 flex items-center gap-2.5">
              <button
                onClick={() => onBannerClick && onBannerClick(current)}
                className="px-4 py-2 rounded-xl bg-white hover:bg-amber-50 text-slate-900 font-extrabold text-xs shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 group-active:scale-95"
              >
                <span>{current.linkText || '자세히 보기'}</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-amber-600" />
              </button>

              {current.tag && (
                <span className="text-xs font-bold text-amber-300 bg-black/40 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-amber-300/30">
                  {current.tag}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Previous / Next Arrow Controls */}
        <button
          onClick={(e) => { e.stopPropagation(); handlePrev(); }}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/30 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 z-30 border border-white/20"
          title="이전 사진"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleNext(); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/30 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 z-30 border border-white/20"
          title="다음 사진"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Minimal Progress Line Dots */}
        <div className="absolute bottom-3 right-5 sm:right-8 z-30 flex items-center gap-1.5">
          {banners.map((_, idx) => (
            <button
              key={idx}
              onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                currentIndex === idx
                  ? 'w-7 bg-amber-400 shadow-sm'
                  : 'w-2 bg-white/40 hover:bg-white/70'
              }`}
              title={`${idx + 1}번 사진`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
