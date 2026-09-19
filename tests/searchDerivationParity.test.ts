import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { Timestamp } from 'firebase/firestore/lite';
import { deriveSearchFields } from '../src/lib/searchDerivation.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/searchDerivation.json', import.meta.url), 'utf8')) as { place: Record<string, unknown>; source: Record<string, unknown> };

test('TypeScript search derivation has exact deterministic parity with the Python basis', async () => {
  const tsResult = await deriveSearchFields(fixture.place, fixture.source);
  const script = [
    'import json,sys',
    'from tools.firestore_place_search_fields.derive import derive_search',
    'x=json.load(sys.stdin)',
    'print(json.dumps(derive_search(x["place"], x["source"]), ensure_ascii=False, sort_keys=True))',
  ].join(';');
  const python = spawnSync('python', ['-X', 'utf8', '-c', script], { cwd: process.cwd(), input: JSON.stringify(fixture), encoding: 'utf8' });
  assert.equal(python.status, 0, python.stderr);
  assert.deepEqual(tsResult, JSON.parse(python.stdout));
  assert.equal(tsResult.region, 'EAST');
  assert.equal(tsResult.category, 'SHOPPING');
  assert.equal(tsResult.petScore, 8);
  assert.match(tsResult.inputHash ?? '', /^[a-f0-9]{64}$/);
});

test('search derivation is idempotent and effective admin inputs affect the result', async () => {
  const first = await deriveSearchFields(fixture.place, fixture.source);
  const second = await deriveSearchFields(structuredClone(fixture.place), structuredClone(fixture.source));
  assert.deepEqual(first, second);
  const changed = structuredClone(fixture.place);
  changed.serviceCategory = 'CAFE';
  changed.regionArea = 'WEST';
  const derived = await deriveSearchFields(changed, fixture.source);
  assert.equal(derived.category, 'CAFE');
  assert.equal(derived.region, 'WEST');
  assert.notEqual(derived.inputHash, first.inputHash);
});

test('TypeScript and Python keep parity for encoded text, sparse numeric fallbacks, and normalized clear metadata', async () => {
  const script = [
    'import json,sys',
    'from tools.firestore_place_search_fields.derive import derive_search',
    'x=json.load(sys.stdin)',
    'print(json.dumps(derive_search(x["place"], x["source"]), ensure_ascii=False, sort_keys=True))',
  ].join(';');
  const cases = [
    (value: typeof fixture) => { value.place.shortDescription = '&#xBBF8;&#xD655;&#xC778;'; },
    (value: typeof fixture) => { value.place.latitude = '   '; },
    (value: typeof fixture) => { (value.place.manualAdmin as Record<string, unknown>).clearedFields = ['phone', 'address', 'phone']; },
  ];
  for (const mutate of cases) {
    const value = structuredClone(fixture);
    mutate(value);
    const ts = await deriveSearchFields(value.place, value.source);
    const python = spawnSync('python', ['-X', 'utf8', '-c', script], { cwd: process.cwd(), input: JSON.stringify(value), encoding: 'utf8' });
    assert.equal(python.status, 0, python.stderr);
    assert.deepEqual(ts, JSON.parse(python.stdout));
  }
});

test('live Firestore timestamps hash exactly like the Python snapshot ISO strings', async () => {
  const live = structuredClone(fixture);
  const kto = live.source.kto as Record<string, unknown>;
  kto.createdTime = Timestamp.fromDate(new Date(String(kto.createdTime)));
  kto.modifiedTime = Timestamp.fromDate(new Date(String(kto.modifiedTime)));
  const ts = await deriveSearchFields(live.place, live.source);
  const script = [
    'import json,sys',
    'from tools.firestore_place_search_fields.derive import derive_search',
    'x=json.load(sys.stdin)',
    'print(json.dumps(derive_search(x["place"], x["source"]), ensure_ascii=False, sort_keys=True))',
  ].join(';');
  const python = spawnSync('python', ['-X', 'utf8', '-c', script], { cwd: process.cwd(), input: JSON.stringify(fixture), encoding: 'utf8' });
  assert.equal(python.status, 0, python.stderr);
  assert.deepEqual(ts, JSON.parse(python.stdout));
});

test('TypeScript and Python reject inconsistent pet provenance while allowing administrator confirmation', async () => {
  const cases = [
    { status: 'UNKNOWN', collector: 'Y', pet: { acmpyNeedMtr: '목줄' }, accepted: false },
    { status: 'KTO_OVERLAY_FOUND', collector: 'N', pet: null, accepted: false },
    { status: 'ADMIN_CONFIRMED', collector: 'N', pet: null, accepted: true },
  ] as const;
  const script = [
    'import json,sys',
    'from tools.firestore_place_search_fields.derive import derive_search',
    'x=json.load(sys.stdin)',
    'print(json.dumps(derive_search(x["place"], x["source"]), ensure_ascii=False, sort_keys=True))',
  ].join(';');
  for (const entry of cases) {
    const value = structuredClone(fixture);
    (value.place.petPolicy as Record<string, unknown>).petInformationStatus = entry.status;
    (value.source.collector as Record<string, unknown>).hasPetJoin = entry.collector;
    (value.source.kto as Record<string, unknown>).pet = entry.pet;
    if (entry.accepted) {
      const ts = await deriveSearchFields(value.place, value.source);
      const python = spawnSync('python', ['-X', 'utf8', '-c', script], { cwd: process.cwd(), input: JSON.stringify(value), encoding: 'utf8' });
      assert.equal(python.status, 0, python.stderr);
      assert.deepEqual(ts, JSON.parse(python.stdout));
    } else {
      await assert.rejects(deriveSearchFields(value.place, value.source), /Pet source mismatch/);
      const python = spawnSync('python', ['-X', 'utf8', '-c', script], { cwd: process.cwd(), input: JSON.stringify(value), encoding: 'utf8' });
      assert.notEqual(python.status, 0);
      assert.match(python.stderr, /pet status mismatch/);
    }
  }
  const missingPet = structuredClone(fixture);
  (missingPet.place.petPolicy as Record<string, unknown>).petInformationStatus = 'UNKNOWN';
  (missingPet.source.collector as Record<string, unknown>).hasPetJoin = 'N';
  delete (missingPet.source.kto as Record<string, unknown>).pet;
  const ts = await deriveSearchFields(missingPet.place, missingPet.source);
  const python = spawnSync('python', ['-X', 'utf8', '-c', script], { cwd: process.cwd(), input: JSON.stringify(missingPet), encoding: 'utf8' });
  assert.equal(python.status, 0, python.stderr);
  assert.deepEqual(ts, JSON.parse(python.stdout));
});
