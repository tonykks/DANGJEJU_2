import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HERO_LIMIT, HERO_TOTAL_SCORE_MIN, SEARCH_CATEGORY_LABEL, UI_CATEGORY_TO_SEARCH } from '../src/lib/searchTypes.ts';

test('hero policy constants are score-based not placeId lists', () => {
  assert.equal(HERO_TOTAL_SCORE_MIN, 12);
  assert.equal(HERO_LIMIT, 5);
});

test('UI exposes eight searchable categories without trail/all', () => {
  const keys = Object.keys(UI_CATEGORY_TO_SEARCH).sort();
  assert.deepEqual(keys, ['attraction', 'cafe', 'culture', 'event', 'food', 'leisure', 'shopping', 'stay']);
  assert.equal(SEARCH_CATEGORY_LABEL.EVENT, '축제·공연·행사');
});
