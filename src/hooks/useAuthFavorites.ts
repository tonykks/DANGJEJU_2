import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { User } from 'firebase/auth';
import { getAuthErrorMessage, getCurrentUser, signInWithGoogle, signOutUser, watchAuthState } from '../lib/auth';
import { configurationError } from '../lib/firebase';
import * as favoritesService from '../lib/favorites';
import { createFavoritesSession } from '../lib/favoritesSession';

export function useAuthFavorites() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(!configurationError);
  const [authBusy, setAuthBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const authAction = useRef(false);
  const mounted = useRef(false);
  const [session] = useState(() => createFavoritesSession(favoritesService));
  const favorites = useSyncExternalStore(session.subscribe, session.getSnapshot);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = configurationError ? () => {} : watchAuthState((nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
      setNotice(null);
      void session.setUser(nextUser?.uid ?? null);
    }, () => {
      setUser(null);
      setAuthLoading(false);
      setNotice('로그인 상태를 확인하지 못했습니다. 페이지를 새로고침해 주세요.');
      void session.setUser(null);
    });

    return () => {
      mounted.current = false;
      unsubscribe();
      void session.setUser(null);
    };
  }, [session]);

  async function login() {
    if (configurationError) {
      setNotice(configurationError);
      return;
    }
    if (authLoading || authAction.current) return;
    authAction.current = true;
    setAuthBusy(true);
    setNotice(null);
    try {
      // Called directly from the user's click so popup blockers allow the flow.
      await signInWithGoogle();
    } catch (error) {
      if (mounted.current) setNotice(getAuthErrorMessage(error));
    } finally {
      authAction.current = false;
      if (mounted.current) setAuthBusy(false);
    }
  }

  async function logout() {
    if (authAction.current) return;
    authAction.current = true;
    setAuthBusy(true);
    setNotice(null);
    // Clear immediately; in-flight results are invalidated before signOut resolves.
    void session.setUser(null);
    try {
      await signOutUser();
    } catch (error) {
      if (mounted.current) {
        const currentUser = getCurrentUser();
        setUser(currentUser);
        void session.setUser(currentUser?.uid ?? null);
        setNotice(getAuthErrorMessage(error));
      }
    } finally {
      authAction.current = false;
      if (mounted.current) setAuthBusy(false);
    }
  }

  function toggleSavePlace(placeId: string) {
    if (authLoading || authAction.current) {
      setNotice('로그인 상태를 확인하고 있습니다. 잠시만 기다려 주세요.');
    } else if (!user) {
      setNotice(configurationError ?? '찜한 장소를 계정에 보관하려면 Google로 로그인해 주세요.');
    } else if (getCurrentUser()?.uid !== user.uid || favorites.uid !== user.uid) {
      setNotice('계정을 전환하고 있습니다. 잠시만 기다려 주세요.');
    } else if (favorites.status === 'loading') {
      setNotice('찜 목록을 불러오고 있습니다. 잠시만 기다려 주세요.');
    } else if (favorites.status === 'ready') {
      setNotice(null);
      void session.toggle(placeId);
    }
  }

  return {
    user,
    authLoading,
    authBusy,
    notice,
    dismissNotice: () => setNotice(null),
    login,
    logout,
    toggleSavePlace,
    savedPlaceIds: favorites.uid === user?.uid ? favorites.ids : [],
    favoritesLoading: favorites.status === 'loading',
    favoritesError: favorites.error,
    pendingIds: favorites.pendingIds,
    refreshFavorites: () => {
      setNotice(null);
      if (!authAction.current && getCurrentUser()?.uid === user?.uid) void session.refresh();
    },
  };
}
