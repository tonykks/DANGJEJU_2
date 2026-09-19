import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsImport } from 'tsx/esm/api';

const { default: Header } = await tsImport('../src/components/Header.tsx', import.meta.url);
const noop = () => {};
const user = { uid: 'admin', email: 'admin@example.test', displayName: 'Admin', photoURL: null };
const props = { savedCount: 0, onOpenSaved: noop, onResetHome: noop, user, authLoading: false, authBusy: false, onLogin: noop, onLogout: noop, onOpenAdmin: noop };

test('Header renders the management control only after active-admin authorization', () => {
  const denied = renderToStaticMarkup(React.createElement(Header, { ...props, isAdmin: false }));
  const active = renderToStaticMarkup(React.createElement(Header, { ...props, isAdmin: true }));
  assert.doesNotMatch(denied, /admin-places-header-btn|>관리</);
  assert.match(active, /id="admin-places-header-btn"/);
  assert.match(active, />관리</);
});
