import { Dog, Heart, RefreshCw, Settings } from 'lucide-react';
import type { User } from 'firebase/auth';

interface HeaderProps {
  savedCount: number;
  onOpenSaved: () => void;
  onReloadLoading?: () => void;
  onResetHome?: () => void;
  user: User | null;
  authLoading: boolean;
  authBusy: boolean;
  onLogin: () => void;
  onLogout: () => void;
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
  showSaved?: boolean;
}

export default function Header({
  savedCount,
  onOpenSaved,
  onReloadLoading,
  onResetHome,
  user,
  authLoading,
  authBusy,
  onLogin,
  onLogout,
  isAdmin = false,
  onOpenAdmin,
  showSaved = true,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-amber-100 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2 sm:gap-3">
        {/* Brand Logo & Tagline - 클릭 시 초기화된 홈화면으로 이동 */}
        <div 
          onClick={onResetHome}
          className="flex items-center gap-2 sm:gap-3 cursor-pointer group select-none"
          title="처음 홈화면으로 돌아가기 (초기화)"
        >
          <div 
            className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-400 flex items-center justify-center text-white shadow-md shadow-orange-500/20 group-hover:rotate-6 group-hover:scale-105 transition-transform"
          >
            <Dog className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight group-hover:text-amber-600 transition-colors">
                댕제주
              </h1>
            </div>
            <p className="text-[11px] text-slate-500 font-semibold hidden sm:flex items-center gap-1">
              <span>제주 반려견 스마트 관광 도우미</span>
              <span className="text-amber-500"></span>
            </p>
          </div>
        </div>

        {/* Right side actions: Saved places */}
        <div className="flex items-center gap-2 shrink-0">
          {onReloadLoading && (
            <button
              onClick={onReloadLoading}
              className="p-2 rounded-xl text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors hidden sm:flex items-center gap-1 text-xs font-semibold"
              title="로딩 화면 다시보기"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>인트로</span>
            </button>
          )}

          {showSaved && <button
            id="saved-places-header-btn"
            aria-label={`찜한 장소 ${savedCount}개 열기`}
            onClick={onOpenSaved}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl border text-xs font-bold transition-all shadow-xs ${
              savedCount > 0
                ? 'bg-rose-50/80 border-rose-200 text-rose-700 hover:bg-rose-100'
                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
            }`}
          >
            <Heart className={`w-4 h-4 ${savedCount > 0 ? 'text-rose-500 fill-current' : 'text-slate-400'}`} />
            <span className="hidden sm:inline">찜한 장소</span>
            {savedCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black">
                {savedCount}
              </span>
            )}
          </button>}

          {isAdmin && onOpenAdmin && (
            <button
              id="admin-places-header-btn"
              onClick={onOpenAdmin}
              className="flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-black text-amber-800 hover:bg-amber-100"
            >
              <Settings className="h-4 w-4" />
              <span>관리</span>
            </button>
          )}

          {user ? (
            <div className="flex items-center gap-1.5 text-xs">
              {user.photoURL ? (
                <img src={user.photoURL} alt="계정 사진" referrerPolicy="no-referrer" className="w-6 h-6 rounded-full" />
              ) : (
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold" aria-hidden="true">
                  {(user.email ?? user.displayName ?? 'G').slice(0, 1).toUpperCase()}
                </span>
              )}
              <span title={user.email ?? user.displayName ?? 'Google 계정'} className="hidden lg:inline max-w-28 truncate text-slate-600">
                {user.email ?? user.displayName ?? 'Google 계정'}
              </span>
              <button id="google-logout-btn" onClick={onLogout} disabled={authBusy} aria-label={`${user.email ?? 'Google 계정'} 로그아웃`} className="px-2 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold disabled:opacity-50">
                {authBusy ? '처리 중…' : '로그아웃'}
              </button>
            </div>
          ) : (
            <button id="google-login-btn" onClick={onLogin} disabled={authLoading || authBusy} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-amber-50 disabled:opacity-50">
              {authLoading ? '계정 확인 중…' : authBusy ? '로그인 중…' : 'Google 로그인'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
