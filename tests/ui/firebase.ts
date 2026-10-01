import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore/lite';
if (typeof location !== 'undefined' && !['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Local emulator only');
export const db = getFirestore(initializeApp({ projectId: 'demo-place-crud' }, 'crud-ui'));
connectFirestoreEmulator(db, '127.0.0.1', 8185, { mockUserToken: { sub: 'active-admin' } });
export const auth = null;
export const configurationError = null;
