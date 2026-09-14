import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth } from './firebase';

function requireAuth() {
  if (!auth) throw new Error('Firebase Authentication is not configured.');
  return auth;
}

export function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(requireAuth(), provider);
}

export function signOutUser() {
  return signOut(requireAuth());
}

export function watchAuthState(onChange: (user: User | null) => void, onError: (error: Error) => void) {
  return onAuthStateChanged(requireAuth(), onChange, onError);
}

export function getCurrentUser() {
  return auth?.currentUser ?? null;
}

export function getAuthErrorMessage(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '로그인이 취소되었습니다. 원할 때 다시 로그인해 주세요.';
    case 'auth/popup-blocked':
      return '팝업이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 로그인해 주세요.';
    case 'auth/network-request-failed':
      return '연결을 확인한 뒤 다시 시도해 주세요.';
    case 'auth/unauthorized-domain':
    case 'auth/operation-not-allowed':
    case 'auth/invalid-api-key':
    case 'auth/configuration-not-found':
      return '로그인 서비스 설정을 확인하고 있습니다. 잠시 후 다시 이용해 주세요.';
    default:
      return '로그인 상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
}
