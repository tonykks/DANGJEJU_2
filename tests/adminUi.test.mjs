import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsImport } from 'tsx/esm/api';

const { default: Header } = await tsImport('../src/components/Header.tsx', import.meta.url);
const adminEditorSource = readFileSync(new URL('../src/components/AdminPlaceEditor.tsx', import.meta.url), 'utf8');
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

test('admin confirmation explicitly identifies selected fields omitted as unchanged', () => {
  assert.match(adminEditorSource, /role="note"[\s\S]*현재 표시값과 같아 저장에서 제외된 선택 항목/);
  assert.match(adminEditorSource, /AdminUnchangedSelectionNotice selections=\{plan\.unchangedSelections\}/);
  assert.match(adminEditorSource, /selection\.label\}: \{formatAdminValue\(selection\.value\)\}/);
});

test('admin actions expose pointer, disabled, progress, and inline error states', () => {
  assert.match(adminEditorSource, /cursor-pointer/);
  assert.match(adminEditorSource, /disabled:cursor-not-allowed/);
  assert.match(adminEditorSource, /aria-busy=\{busy\}/);
  assert.match(adminEditorSource, /busy \? '저장 중…' : '확인하고 저장'/);
  assert.match(adminEditorSource, /role="alert"[\s\S]*actionError/);
});
