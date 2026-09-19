import { useEffect, useState } from 'react';
import { adminHashUrl, homeHashUrl, routeFromHash, type AppRoute } from '../lib/hashRoute';

export function useHashRoute() {
  const [route, setRoute] = useState<AppRoute>(() => routeFromHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return {
    route,
    goAdmin: () => { window.location.hash = '/admin/places'; },
    goHome: (replace = false) => {
      const url = homeHashUrl(window.location.pathname, window.location.search);
      if (replace) {
        window.history.replaceState(null, '', url);
        setRoute('home');
      } else {
        window.location.hash = '/';
      }
    },
    adminUrl: adminHashUrl(window.location.pathname, window.location.search),
  };
}
