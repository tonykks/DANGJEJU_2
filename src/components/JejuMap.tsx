import PlaceImage from './PlaceImage';
import { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import { Place } from '../types';
import { ChevronRight, MapPin } from 'lucide-react';

interface JejuMapProps {
  places: Place[];
  selectedPlace: Place | null;
  onSelectPlace: (place: Place) => void;
  onOpenDetail?: (place: Place) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  cafe: '#f97316',
  attraction: '#8b5cf6',
  food: '#ef4444',
  shopping: '#d946ef',
  stay: '#3b82f6',
  leisure: '#0891b2',
  culture: '#6366f1',
  event: '#ec4899',
  spot: '#8b5cf6',
  trail: '#10b981',
};

export default function JejuMap({ places, selectedPlace, onSelectPlace, onOpenDetail }: JejuMapProps) {
  const mappedPlaces = useMemo(() => places.filter((p) => p.coordinates !== null), [places]);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize leaflet map
    const map = L.map(mapContainerRef.current, {
      center: [33.38, 126.53],
      zoom: 10,
      zoomControl: false,
      attributionControl: true,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;
    mapInstanceRef.current = map;

    // Trigger invalidateSize and observe container resizing
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(timer);
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Update markers whenever places or selectedPlace change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    mappedPlaces.forEach((place) => {
      const isSelected = selectedPlace?.id === place.id;
      const known = place.petInformationStatus === 'KTO_OVERLAY_FOUND' || place.petInformationStatus === 'ADMIN_CONFIRMED';
      const color = known ? (CATEGORY_COLORS[place.category] || '#64748b') : '#94a3b8';
      const border = isSelected ? '#fbbf24' : (known ? '#ffffff' : '#cbd5e1');

      const markerName = document.createElement('span');
      markerName.textContent = place.name.length > 8 ? place.name.slice(0, 8) + '…' : place.name;
      const customIcon = L.divIcon({
        className: 'custom-jeju-marker',
        html: `
          <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: ${isSelected ? '#0f172a' : color};
            color: #ffffff;
            border: 2px ${known ? 'solid' : 'dashed'} ${border};
            border-radius: 9999px;
            padding: 5px 9px;
            font-size: 11px;
            font-weight: 800;
            box-shadow: 0 4px 12px rgba(0,0,0,0.28);
            white-space: nowrap;
            transform: translate(-50%, -50%) ${isSelected ? 'scale(1.18)' : 'scale(1)'};
            transition: all 0.2s ease;
            cursor: pointer;
            opacity: ${known ? '1' : '0.85'};
          ">
            <span style="margin-right: 3px;">🐾</span>
            <span>${markerName.innerHTML}</span>
          </div>
        `,
        iconSize: [80, 28],
        iconAnchor: [40, 14],
      });

      const marker = L.marker([place.coordinates.lat, place.coordinates.lng], {
        icon: customIcon,
      });

      marker.on('click', () => {
        onSelectPlace(place);
      });

      markersGroup.addLayer(marker);
    });

    if (mappedPlaces.length > 0 && !selectedPlace) {
      const bounds = L.latLngBounds(mappedPlaces.map((p) => [p.coordinates.lat, p.coordinates.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }, [mappedPlaces, selectedPlace, onSelectPlace]);

  // Pan to selected place smoothly
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedPlace?.coordinates) return;

    map.flyTo([selectedPlace.coordinates.lat, selectedPlace.coordinates.lng], 13, {
      duration: 0.8,
    });
  }, [selectedPlace]);

  return (
    <div className="relative w-full h-full min-h-[460px] rounded-3xl overflow-hidden shadow-md border border-slate-200/90 bg-slate-50">
      <div id="jeju-map-container" ref={mapContainerRef} className="w-full h-full" />

      {places.length > mappedPlaces.length && (
        <div className="absolute top-3 left-3 z-[1000] max-w-[240px] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-[11px] text-slate-600">
          좌표 확인이 필요한 {places.length - mappedPlaces.length}곳은 목록에서 확인할 수 있습니다.
        </div>
      )}
      {/* Map Legend: Bottom-Left Vertical List */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-2.5 sm:p-3 shadow-lg min-w-[110px] sm:min-w-[120px]">
        <div className="flex items-center gap-1.5 pb-1.5 mb-1.5 border-b border-slate-100">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-800" />
          <span className="text-xs font-black text-slate-800 tracking-tight">유형 안내</span>
        </div>
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex items-center gap-2 px-1 py-0.5 rounded-md hover:bg-slate-50 text-slate-700 font-bold transition-colors">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-2xs shrink-0" />
            <span className="text-[11px] sm:text-xs">카페</span>
          </div>
          <div className="flex items-center gap-2 px-1 py-0.5 rounded-md hover:bg-slate-50 text-slate-700 font-bold transition-colors">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-2xs shrink-0" />
            <span className="text-[11px] sm:text-xs">산책로</span>
          </div>
          <div className="flex items-center gap-2 px-1 py-0.5 rounded-md hover:bg-slate-50 text-slate-700 font-bold transition-colors">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-2xs shrink-0" />
            <span className="text-[11px] sm:text-xs">음식점</span>
          </div>
          <div className="flex items-center gap-2 px-1 py-0.5 rounded-md hover:bg-slate-50 text-slate-700 font-bold transition-colors">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-2xs shrink-0" />
            <span className="text-[11px] sm:text-xs">관광지</span>
          </div>
          <div className="flex items-center gap-2 px-1 py-0.5 rounded-md hover:bg-slate-50 text-slate-700 font-bold transition-colors">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-2xs shrink-0" />
            <span className="text-[11px] sm:text-xs">숙소</span>
          </div>
        </div>
      </div>

      {/* Selected place floating preview on map (Top-Right so it doesn't overlap bottom-left legend) */}
      {selectedPlace && (
        <div 
          onClick={() => onOpenDetail && onOpenDetail(selectedPlace)}
          className="absolute top-4 right-4 left-4 sm:left-auto sm:w-80 md:w-88 z-[1000] bg-white/95 backdrop-blur-md rounded-2xl p-3 shadow-xl border border-amber-200 cursor-pointer hover:border-amber-400 transition-all group animate-in fade-in slide-in-from-top-3 duration-200"
        >
          <div className="flex items-center gap-3">
            <PlaceImage
              place={selectedPlace}
              alt={selectedPlace.name}
              className="w-14 h-14 rounded-xl object-cover shrink-0"
              referrerPolicy="no-referrer"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold mb-0.5">
                <MapPin className="w-3 h-3 text-amber-500" />
                <span>{selectedPlace.regionName}</span>
              </div>
              <h4 className="text-sm font-extrabold text-slate-900 truncate group-hover:text-amber-600 transition-colors">
                {selectedPlace.name}
              </h4>
              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                {selectedPlace.petInformationLabel}
              </p>
            </div>
            <div className="w-7 h-7 rounded-full bg-amber-50 group-hover:bg-amber-100 flex items-center justify-center text-amber-600 shrink-0 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
