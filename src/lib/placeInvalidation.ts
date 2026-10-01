export const PLACE_DATA_CHANGED = 'dangjeju:places-changed';
export function invalidatePlaceQueries() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PLACE_DATA_CHANGED));
}
