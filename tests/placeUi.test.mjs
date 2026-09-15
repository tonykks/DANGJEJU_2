import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsImport } from 'tsx/esm/api';
import { adaptPlace } from '../src/lib/placeAdapter.ts';

const { default: PlaceCard } = await tsImport('../src/components/PlaceCard.tsx', import.meta.url);
const { default: PlaceListItem } = await tsImport('../src/components/PlaceListItem.tsx', import.meta.url);
const { default: PlaceDetailModal } = await tsImport('../src/components/PlaceDetailModal.tsx', import.meta.url);
const { default: SavedPlacesDrawer } = await tsImport('../src/components/SavedPlacesDrawer.tsx', import.meta.url);
const place = adaptPlace({ id: 'kto-1', path: 'places/kto-1', data: { placeId: 'kto-1', name: '<img src=x onerror=alert(1)>', petPolicy: { petInformationStatus: 'UNKNOWN' } } });
const noop = () => {};

test('UNKNOWN cards and list rows never render inferred dog sizes, outdoor-only, free fees or amenities', () => {
  for (const component of [PlaceCard, PlaceListItem]) {
    const html = renderToStaticMarkup(React.createElement(component, { place, isSelected: false, isSaved: false, onSelect: noop, onToggleSave: noop, onOpenDetail: noop }));
    assert.match(html, /반려동물 정보 미확인/);
    assert.doesNotMatch(html, /소·중형견|대형견 환영|야외 전용|반려견 무료|멍푸치노|동반가능|✕ 불가/);
    assert.match(html, /&lt;img/);
    assert.match(html, /place-placeholder.svg/);
  }
});

test('UNKNOWN detail opens with the explanatory notice and no permission matrix', () => {
  const html = renderToStaticMarkup(React.createElement(PlaceDetailModal, { place, isOpen: true, isSaved: false, onClose: noop, onToggleSave: noop }));
  assert.match(html, /동반 불가를 의미하지 않/);
  assert.doesNotMatch(html, /✕ 불가|✓ 동반가능|소형견|중형견|대형견/);
  // Default tab is "반려동물 정보" (policy)
  assert.match(html, /border-amber-500 text-amber-600[^"]*"[^>]*>[\s\S]*?반려동물 정보/);
});

test('saved drawer exposes catalog information status without inventing dog-size conditions', () => {
  const html = renderToStaticMarkup(React.createElement(SavedPlacesDrawer, { isOpen: true, savedPlaces: [place], isSignedIn: true, isLoading: false, authBusy: false, pendingIds: [], error: null, onClose: noop, onRemove: noop, onSelect: noop, onLogin: noop, onRetry: noop }));
  assert.match(html, /반려동물 정보 미확인/);
  assert.doesNotMatch(html, /동반 가능 크기|소·중형견/);
});
