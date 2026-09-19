export type AppRoute = 'home' | 'admin-places';

export const ADMIN_PLACES_HASH = '#/admin/places';

export function routeFromHash(hash: string): AppRoute {
  return hash.replace(/\/+$/, '') === ADMIN_PLACES_HASH ? 'admin-places' : 'home';
}

export function adminHashUrl(pathname: string, search = ''): string {
  return `${pathname}${search}${ADMIN_PLACES_HASH}`;
}

export function homeHashUrl(pathname: string, search = ''): string {
  return `${pathname}${search}#/`;
}
