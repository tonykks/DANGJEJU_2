import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { loadPlacesCatalog, type PlacesCatalog } from '../lib/placesCatalog';

export function usePlacesCatalog() {
  const [catalog, setCatalog] = useState<PlacesCatalog | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus('loading');
    const request = db ? loadPlacesCatalog(db) : Promise.reject(new Error('Missing catalog configuration'));
    void request.then((result) => {
      if (active) { setCatalog(result); setStatus('ready'); }
    }, () => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [attempt]);
  return { catalog, status, retry: () => setAttempt((current) => current + 1) };
}
