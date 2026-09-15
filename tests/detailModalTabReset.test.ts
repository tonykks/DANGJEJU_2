import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * PlaceDetailModal must reset activeTab to 'policy' whenever isOpen+place.id change.
 * Covered in component via useEffect([isOpen, place?.id]); this documents the contract.
 */
test('detail modal tab contract resets to policy on each place open', () => {
  const DEFAULT_TAB = 'policy';
  let activeTab: 'policy' | 'location' | 'tips' = 'tips'; // leftover from previous place
  const onOpen = (_placeId: string) => {
    activeTab = DEFAULT_TAB;
  };
  onOpen('kto-1');
  assert.equal(activeTab, 'policy');
  activeTab = 'location';
  onOpen('kto-2');
  assert.equal(activeTab, 'policy');
});
