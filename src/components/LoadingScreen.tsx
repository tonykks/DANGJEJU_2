import { useEffect, useState } from 'react';
import { Dog } from 'lucide-react';

interface LoadingScreenProps {
  onLoaded?: () => void;
  minDuration?: number;
  persistent?: boolean;
}

export default function LoadingScreen({ onLoaded, minDuration = 1000, persistent = false }: LoadingScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (persistent) return;
    const timer = setTimeout(() => {
      setFadeOut(true);
      const hideTimer = setTimeout(() => {
        setIsVisible(false);
        if (onLoaded) onLoaded();
      }, 350);
      return () => clearTimeout(hideTimer);
    }, minDuration);

    return () => clearTimeout(timer);
  }, [minDuration, onLoaded, persistent]);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-b from-amber-50/90 via-orange-50/50 to-white backdrop-blur-xs transition-opacity duration-350 ${
        fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Centered Cute Dog Icon Only */}
      <div className="relative flex items-center justify-center">
        {/* Soft pulse glow ring */}
        <div className="absolute -inset-4 rounded-full bg-amber-400/20 animate-ping" />
        
        {/* Cute bouncing dog icon */}
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-400 flex items-center justify-center shadow-2xl shadow-orange-500/30 border-4 border-white animate-bounce duration-1000">
          <Dog className="w-12 h-12 sm:w-14 sm:h-14 text-white drop-shadow-md transform -rotate-6" />
        </div>
      </div>
    </div>
  );
}
