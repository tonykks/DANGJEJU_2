import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDemoServer } from './ui/serve.mjs';

test('CRUD forms render all editable fields, required choices and explicit bulk selection controls', async () => {
  const server = await createDemoServer();
  try {
    const { AdminCreatePlace, AdminRegionManager } = await server.ssrLoadModule('/src/components/AdminPlaceCrud.tsx');
    const { ADMIN_FIELD_DEFINITIONS } = await server.ssrLoadModule('/src/lib/adminPlaceEditor.ts');
    const noop = () => {};
    const Input = ({ definition }) => React.createElement('input', { 'data-field': definition.id });
    const create = renderToStaticMarkup(React.createElement(AdminCreatePlace, { uid: 'active-admin', Input, onClose: noop, onCreated: noop, onBusyChange: noop }));
    for (const { id } of ADMIN_FIELD_DEFINITIONS) assert.ok(create.includes(`data-field="${id}"`), id);
    assert.match(create, /장소명 \*/); assert.match(create, /검색 권역 \*/); assert.match(create, /서비스 장소유형 \*/);
    const manager = renderToStaticMarkup(React.createElement(AdminRegionManager, { onEdit: noop, onBusyChange: noop }));
    for (const label of ['정상 장소', '삭제된 장소', '현재 표시된 항목 선택', '현재 조건 전체 선택', '전체 선택 해제', '선택 장소 삭제']) assert.ok(manager.includes(label));
    assert.equal((manager.match(/<option /g) ?? []).length, 14);
    assert.match(manager, /aria-label="관리 지역"/); assert.match(manager, /aria-label="관리 업종"/);
  } finally { await server.close(); }
});
