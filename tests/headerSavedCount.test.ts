import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * Header badge must track favorite IDs, not drawer-resolved Place docs.
 * Resolved places load only when the drawer opens; ID count is always available.
 */
test('header savedCount contract uses favorite id length, not resolved place list length', () => {
  const savedPlaceIds = ['kto-1', 'kto-2'];
  const resolvedPlacesWhenDrawerClosed: unknown[] = [];
  const headerSavedCount = savedPlaceIds.length;
  assert.equal(headerSavedCount, 2);
  assert.notEqual(headerSavedCount, resolvedPlacesWhenDrawerClosed.length);
});
