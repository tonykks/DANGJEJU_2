import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore/lite';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
};

const hasConfig = [firebaseConfig.apiKey, firebaseConfig.authDomain, firebaseConfig.projectId, firebaseConfig.appId]
  .every((value) => Boolean(value) && !/^(YOUR_|MY_|REPLACE_)/i.test(value!));

let auth: Auth | null = null;
let db: Firestore | null = null;
let configurationError: string | null = null;

// Missing configuration is surfaced by the catalog error/retry UI and auth notices.
if (!hasConfig) {
  configurationError = '로그인 서비스를 준비 중입니다. 잠시 후 다시 이용해 주세요.';
} else {
  try {
    const app = getApps().some((app) => app.name === '[DEFAULT]') ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    // Lite always talks to the server: no favorites cache or offline write queue.
    db = getFirestore(app);
  } catch {
    auth = null;
    db = null;
    configurationError = '로그인 서비스를 연결하지 못했습니다. 잠시 후 다시 이용해 주세요.';
  }
}

export { auth, db, configurationError };
