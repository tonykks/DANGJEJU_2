import PlaceImage from './PlaceImage';
import { useEffect, useState } from 'react';
import { Place } from '../types';
import { 
  X, 
  MapPin, 
  Clock, 
  Phone, 
  Car, 
  ShieldAlert, 
  Heart, 
  Share2, 
  Check, 
  Dog, 
  Sparkles,
  ExternalLink,
  Copy
} from 'lucide-react';

interface PlaceDetailModalProps {
  place: Place | null;
  isOpen: boolean;
  onClose: () => void;
  isSaved: boolean;
  onToggleSave: (placeId: string) => void;
}

export default function PlaceDetailModal({
  place,
  isOpen,
  onClose,
  isSaved,
  onToggleSave,
}: PlaceDetailModalProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'policy' | 'location' | 'tips'>('policy');

  // Each open / place switch starts on the first tab ("반려동물 정보").
  useEffect(() => {
    if (isOpen && place) {
      setActiveTab('policy');
    }
  }, [isOpen, place?.id]);

  if (!isOpen || !place) return null;

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(place.roadAddress || place.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `[댕제주] ${place.name}`,
        text: `제주 관광 장소: ${place.name} (${place.shortDesc})`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      handleCopyAddress();
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div 
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col border border-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Image with Badges */}
        <div className="relative h-56 sm:h-64 w-full overflow-hidden bg-slate-100 flex-shrink-0">
          <PlaceImage
            place={place}
            alt={place.name}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* Close & Action Buttons */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              id={`modal-save-btn-${place.id}`}
              onClick={() => onToggleSave(place.id)}
              className={`p-2.5 rounded-full backdrop-blur-md transition-colors shadow-sm ${
                isSaved ? 'bg-rose-500 text-white' : 'bg-white/80 text-slate-700 hover:bg-white'
              }`}
              title="관심 장소 저장"
            >
              <Heart className={`w-5 h-5 ${isSaved ? 'fill-current' : ''}`} />
            </button>
            <button
              id={`modal-share-btn-${place.id}`}
              onClick={handleShare}
              className="p-2.5 rounded-full bg-white/80 backdrop-blur-md text-slate-700 hover:bg-white transition-colors shadow-sm"
              title="공유하기"
            >
              <Share2 className="w-5 h-5" />
            </button>
            <button
              id="modal-close-btn"
              onClick={onClose}
              className="p-2.5 rounded-full bg-black/40 backdrop-blur-md text-white hover:bg-black/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Title Info over Hero */}
          <div className="absolute bottom-4 left-5 right-5 text-white">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500 text-white">
                {place.regionName}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/20 backdrop-blur-md">
                {place.petInformationLabel}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              {place.name}
            </h2>
            <p className="text-xs sm:text-sm text-slate-200 mt-1 line-clamp-1">
              {place.shortDesc}
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/80 px-5 pt-3 gap-2 flex-shrink-0">
          <button
            onClick={() => setActiveTab('policy')}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'policy'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Dog className="w-4 h-4" />
            반려동물 정보
          </button>
          <button
            onClick={() => setActiveTab('location')}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'location'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <MapPin className="w-4 h-4" />
            위치 & 주차 안내
          </button>
          <button
            onClick={() => setActiveTab('tips')}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'tips'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            편의 & 주의사항
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'policy' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <h4 className="text-sm font-bold text-slate-800">{place.petInformationLabel}</h4>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">{place.petInformationNotice}</p>
              </div>
              {Boolean(place.petDetails?.length) && (
                <dl className="space-y-3">
                  {place.petDetails!.map((detail) => (
                    <div key={detail.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <dt className="text-xs font-bold text-slate-500">{detail.label}</dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}

          {activeTab === 'location' && (
            <div className="space-y-4">
              {/* Address with copy */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-slate-500 font-semibold">주소</div>
                      <div className="text-sm font-bold text-slate-800 mt-0.5">
                        {place.roadAddress || place.address || '주소 미확인'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleCopyAddress}
                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? '복사완료' : '주소 복사'}
                  </button>
                </div>

                {/* Parking info */}
                <div className="pt-3 border-t border-slate-200/80 flex items-start gap-2.5">
                  <Car className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs text-slate-500 font-semibold">주차 공간</div>
                    <div className="text-sm font-semibold text-slate-800 mt-0.5">
                      {place.parkingInfo}
                    </div>
                  </div>
                </div>

                {/* Hours and phone */}
                <div className="pt-3 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-xs font-medium text-slate-700">{place.businessHours}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                    {place.contactNumber ? <a href={`tel:${place.contactNumber}`} className="text-xs font-medium text-blue-600 hover:underline">
                      {place.contactNumber}
                    </a> : <span className="text-xs text-slate-500">연락처 미확인</span>}
                  </div>
                </div>
              </div>

              {/* Map link buttons */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <a
                  href={`https://map.kakao.com/link/search/${encodeURIComponent(place.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold text-xs transition-colors shadow-xs"
                >
                  <ExternalLink className="w-4 h-4" />
                  카카오맵으로 길찾기
                </a>
                <a
                  href={`https://map.naver.com/v5/search/${encodeURIComponent(place.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs transition-colors shadow-xs"
                >
                  <ExternalLink className="w-4 h-4" />
                  네이버 지도로 보기
                </a>
              </div>
            </div>
          )}

          {activeTab === 'tips' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p>{place.fullDesc}</p>
                <p className="mt-2 text-xs text-slate-500">편의시설은 아래 제공된 정보와 시설 문의를 통해 확인해 주세요.</p>
                {!place.petDetails?.length && <p className="mt-2">{place.petInformationNotice}</p>}
              </div>

              {/* Recommended Points */}
              {place.recommendedPoints && place.recommendedPoints.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/60">
                  <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    KTO 제공 정보
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-700">
                    {place.recommendedPoints.map((pt, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-amber-500 font-bold">•</span>
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Caution Notes */}
              {place.cautionNotes && place.cautionNotes.length > 0 && (
                <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200/60">
                  <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    KTO 동반 시 주의사항
                  </h4>
                  <ul className="space-y-1.5 text-xs text-rose-950">
                    {place.cautionNotes.map((note, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-rose-500 font-bold">•</span>
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 flex-shrink-0">
          <span>제주 6팀 「댕제주」 · KTO 관광 정보</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
