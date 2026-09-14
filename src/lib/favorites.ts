import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore/lite';
import { auth, db } from './firebase';

function favoritesCollection(uid: string) {
  if (!db || !uid || auth?.currentUser?.uid !== uid) {
    throw new Error('Favorites require the current signed-in user.');
  }
  return collection(db, 'users', uid, 'favorites');
}

function favoriteDocument(uid: string, placeId: string) {
  if (!placeId || placeId.includes('/') || placeId === '.' || placeId === '..') {
    throw new Error('Invalid place ID.');
  }
  return doc(favoritesCollection(uid), placeId);
}

export async function listFavorites(uid: string): Promise<string[]> {
  const snapshot = await getDocs(favoritesCollection(uid));
  return snapshot.docs.filter((entry) => entry.data().placeId === entry.id).map((entry) => entry.id);
}

export async function addFavorite(uid: string, placeId: string): Promise<void> {
  await setDoc(favoriteDocument(uid, placeId), { placeId, createdAt: serverTimestamp() });
}

export async function removeFavorite(uid: string, placeId: string): Promise<void> {
  await deleteDoc(favoriteDocument(uid, placeId));
}
