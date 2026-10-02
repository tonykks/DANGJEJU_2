import PlaceImage from './PlaceImage';
import { useEffect, useState } from 'react';
import { Place } from '../types';
import { 
  X, 
  MapPin, 
  Heart, 
  Share2, 
  Check, 
  Dog,
  Car,
  Clock,
  Phone,
  Sparkles,
  ShieldAlert, 
  AlertTriangle,
  ShoppingBag,
  Gift,
  Building,
  Home,
  ExternalLink,
  Copy,
  Info
} from 'lucide-react';

const TRI_LABEL = { TRUE: '가능/제공', FALSE: '불가/미제공', UNKNOWN: '미확인' } as const;
const POLICY_LABELS: [keyof Place['petPolicy'], string][] = [
  ['petAcceptance', '반려동물 동반'], ['smallDogAllowed', '소형견'], ['mediumDogAllowed', '중형견'],
  ['largeDogAllowed', '대형견'], ['indoorAllowed', '실내'], ['outdoorAllowed', '실외'],
  ['carrierRequired', '이동장 필요'], ['leashRequired', '리드줄 필요'], ['offLeashZoneAvailable', '오프리쉬 공간'],
];
const AMENITY_LABELS: [keyof Place['amenities'], string][] = [
  ['freeParking', '무료 주차'], ['dogMenu', '반려견 메뉴'], ['waterBowlProvided', '물그릇'],
  ['wasteBagsProvided', '배변봉투'], ['fencedYard', '펜스 공간'], ['photoZone', '포토존'],
];

function policyValueLabel(key: keyof Place['petPolicy'], value: 'TRUE' | 'FALSE' | 'UNKNOWN') {
  if (key === 'carrierRequired' || key === 'leashRequired') {
    return value === 'TRUE' ? '필수' : value === 'FALSE' ? '필수 아님' : '미확인';
  }
  return TRI_LABEL[value];
}

interface PlaceDetailModalProps {
  place: Place | null;
  isOpen: boolean;
  onClose: () => void;
  isSaved: boolean;
  onToggleSave: (placeId: string) => void;
}

const CATEGORY_NAMES: Record<string, string> = {
  spot: '관광지',
  trail: '산책로',
  stay: '숙소',
  cafe: '카페',
  food: '음식점',
};

export default function PlaceDetailModal({
  place,
  isOpen,
  onClose,
  isSaved,
  onToggleSave,
}: PlaceDetailModalProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'pet' | 'location' | 'tips'>('pet');

  // Each open / place switch starts on the first tab ("반려견 동반 조건").
  useEffect(() => {
    if (isOpen && place) {
      setActiveTab('pet');
    }
  }, [isOpen, place?.id]);

  if (!isOpen || !place) return null;

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(place.address);
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

  const policyFacts = POLICY_LABELS.map(([key, label]) => ({ key, label, value: place.petPolicy[key] }))
    .filter((fact): fact is { key: keyof Place['petPolicy']; label: string; value: keyof typeof TRI_LABEL } => typeof fact.value === 'string' && fact.value in TRI_LABEL && fact.value !== 'UNKNOWN');
  const amenityFacts = AMENITY_LABELS.map(([key, label]) => ({ key, label, value: place.amenities[key] }))
    .filter((fact): fact is { key: keyof Place['amenities']; label: string; value: keyof typeof TRI_LABEL } => typeof fact.value === 'string' && fact.value in TRI_LABEL && fact.value !== 'UNKNOWN');

  const petDetailEntries = place.petDetails ?? [];
  const detailValue = (...terms: string[]) => {
    const normalized = terms.map((term) => term.toLowerCase());
    return petDetailEntries.find((detail) => {
      const haystack = `${detail.key} ${detail.label}`.toLowerCase();
      return normalized.some((term) => haystack.includes(term));
    })?.value || '';
  };
  const acceptanceSummary = place.petType || detailValue('동반유형', '동반 유형', '동반가능', '동반 가능')
    || (place.petPolicy.petAcceptance !== 'UNKNOWN' ? policyValueLabel('petAcceptance', place.petPolicy.petAcceptance) : '미확인');
  const sizeSummary = place.petAllowed || place.petPolicy.sizeDescription
    || (place.petPolicy.allowedSizes.length > 0 ? place.petPolicy.allowedSizes.join(', ') : '')
    || detailValue('동반가능동물', '동반 가능 동물', '크기', '견종') || '미확인';
  const requiredPetDetail = petDetailEntries.find((detail) => detail.key === 'acmpyNeedMtr')?.value || '';
  const leashSummary = requiredPetDetail || place.petNeed || place.petPolicy.leashDescription
    || detailValue('필수사항', '필수 사항', '필요 사항', '목줄', '리드줄', '매너벨트', '입마개', '이동장')
    || (place.petPolicy.leashRequired !== 'UNKNOWN' ? policyValueLabel('leashRequired', place.petPolicy.leashRequired) : '미확인');
  const indoorSummary = place.petIndoorInfo || detailValue('실내')
    || (place.petPolicy.indoorAllowed !== 'UNKNOWN' ? policyValueLabel('indoorAllowed', place.petPolicy.indoorAllowed) : '미확인');
  const outdoorSummary = detailValue('실외', '야외')
    || (place.petPolicy.outdoorAllowed !== 'UNKNOWN' ? policyValueLabel('outdoorAllowed', place.petPolicy.outdoorAllowed) : '')
    || (place.petPolicy.spaceDescription && /실외|야외|외부/.test(place.petPolicy.spaceDescription) ? place.petPolicy.spaceDescription : '')
    || '미확인';

  const consumedPetDetailKeys = new Set(
    petDetailEntries
      .filter((detail) => [acceptanceSummary, sizeSummary, leashSummary, indoorSummary, outdoorSummary].includes(detail.value))
      .map((detail) => detail.key),
  );
  const remainingPetDetails = petDetailEntries.filter((detail) => !consumedPetDetailKeys.has(detail.key));

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
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

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
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white">
                {place.regionName}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/20 backdrop-blur-md">
                {place.petInformationLabel}
              </span>
              {place.petType && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/90 text-white backdrop-blur-md">
                  🐾 {place.petType}
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              {place.name}
            </h2>
            <p className="text-xs sm:text-sm text-slate-200 mt-1 line-clamp-1">
              {place.address}
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/80 px-5 pt-3 gap-2 flex-shrink-0">
          <button
            onClick={() => setActiveTab('pet')}
            className={`pb-3 px-3 text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'pet'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Dog className="w-4 h-4" />
            반려견 동반 조건
          </button>
          <button
            onClick={() => setActiveTab('location')}
            className={`pb-3 px-3 text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 ${
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
            className={`pb-3 px-3 text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 ${
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
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'pet' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <h4 className="text-sm font-bold text-slate-800">{place.petInformationLabel}</h4>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">{place.petInformationNotice}</p>
              </div>

              {/* 방문 결정에 필요한 핵심 반려동물 정보를 먼저 표시 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-[11px] font-bold text-slate-500">동반 가능 여부</div>
                  <div className="mt-1 text-xs font-bold text-slate-800">{acceptanceSummary}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-[11px] font-bold text-slate-500">크기 제한</div>
                  <div className="mt-1 text-xs font-bold text-slate-800">
                    {sizeSummary}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-[11px] font-bold text-slate-500">필수 착용·준비</div>
                  <div className="mt-1 text-xs font-bold text-slate-800">
                    {leashSummary}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-[11px] font-bold text-slate-500">실내</div>
                  <div className="mt-1 text-xs font-bold text-slate-800">{indoorSummary}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-[11px] font-bold text-slate-500">실외</div>
                  <div className="mt-1 text-xs font-bold text-slate-800">{outdoorSummary}</div>
                </div>
              </div>

            </div>
          )}

          {activeTab === 'tips' && (
            <div className="space-y-4">
              {amenityFacts.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    반려견 편의 정보
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {amenityFacts.map((fact) => (
                      <div key={String(fact.key)} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-[11px] font-bold text-slate-500">{fact.label}</div>
                        <div className="mt-1 text-xs font-bold text-slate-800">{TRI_LABEL[fact.value]}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(place.petFacilities || place.petProvidedItems || place.petPurchaseItems) && (
                <dl className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-2">
                  {place.petFacilities && <div><dt className="font-bold">반려동물 관련 시설</dt><dd>{place.petFacilities}</dd></div>}
                  {place.petProvidedItems && <div><dt className="font-bold">비치 품목</dt><dd>{place.petProvidedItems}</dd></div>}
                  {place.petPurchaseItems && <div><dt className="font-bold">구매 가능 품목</dt><dd>{place.petPurchaseItems}</dd></div>}
                </dl>
              )}

              {place.recommendedPoints.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                  <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    이용 참고 정보
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-700">
                    {place.recommendedPoints.map((point, index) => (
                      <li key={index} className="flex items-start gap-2"><span className="text-amber-500 font-bold">•</span><span>{point}</span></li>
                    ))}
                  </ul>
                </div>
              )}

              {((place.cautionNotes.filter((note) =>
                !/^(?:필수사항|동반 시 필요 사항)\s*:/.test(note)
                && (!requiredPetDetail || !note.includes(requiredPetDetail))
              ).length > 0) || place.petRisk || place.petInfo) && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                  <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    방문 시 주의사항
                  </h4>
                  <ul className="space-y-1.5 text-xs text-rose-950">
                    {place.cautionNotes.filter((note) =>
                !/^(?:필수사항|동반 시 필요 사항)\s*:/.test(note)
                && (!requiredPetDetail || !note.includes(requiredPetDetail))
              ).map((note, index) => (
                      <li key={index} className="flex items-start gap-2"><span className="text-rose-500 font-bold">•</span><span>{note}</span></li>
                    ))}
                    {place.petRisk && <li className="flex items-start gap-2"><span className="text-rose-500 font-bold">•</span><span>{place.petRisk}</span></li>}
                    {place.petInfo && <li className="flex items-start gap-2"><span className="text-rose-500 font-bold">•</span><span>{place.petInfo}</span></li>}
                  </ul>
                </div>
              )}
            </div>
          )}

          {activeTab === 'location' && (
            <div className="space-y-4">
              {/* 주소 정보 및 복사 버튼 */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-slate-500 font-semibold">주소</div>
                      <div className="text-sm font-bold text-slate-800 mt-0.5">
                        {place.roadAddress || place.address || '주소 미확인'}
                      </div>
                      {place.roadAddress && place.address && place.roadAddress !== place.address && <div className="mt-1 text-xs text-slate-500">지번: {place.address}</div>}
                    </div>
                  </div>
                  <button
                    onClick={handleCopyAddress}
                    className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
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
                {place.closedDays && (
                  <div className="pt-3 border-t border-slate-200/80 text-xs text-slate-700">
                    <span className="font-bold">휴무일:</span> {place.closedDays}
                  </div>
                )}
                {place.coordinates && (
                  <div className="text-[11px] text-slate-500">좌표 {place.coordinates.lat}, {place.coordinates.lng}</div>
                )}
              </div>

              {/* 지도 길찾기 버튼 */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <a
                  href={`https://map.kakao.com/link/search/${encodeURIComponent(place.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-900 font-black text-xs transition-colors shadow-xs"
                >
                  <ExternalLink className="w-4 h-4" />
                  카카오맵으로 길찾기
                </a>
                <a
                  href={`https://map.naver.com/v5/search/${encodeURIComponent(place.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs transition-colors shadow-xs"
                >
                  <ExternalLink className="w-4 h-4" />
                  네이버 지도로 보기
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 flex-shrink-0">
          <span>제주 6팀 「댕제주」 · 서비스 및 KTO 관광 정보</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
