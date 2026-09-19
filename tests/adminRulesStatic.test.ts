import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

test('rules statically preserve admin/source/protected-field contracts', () => {
  assert.match(rules, /match \/admins\/\{uid\}[\s\S]*allow get: if isOwner\(uid\);[\s\S]*allow list, create, update, delete: if false;/);
  assert.match(rules, /match \/places\/\{placeId\}[\s\S]*allow create, delete: if false;[\s\S]*allow update: if isActiveAdmin\(\)/);
  assert.match(rules, /match \/sources\/\{sourceId\}[\s\S]*allow write: if false;/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(\[/);
  assert.match(rules, /data\.manualAdmin\.source == 'ADMIN_UI'/);
  assert.doesNotMatch(rules, /manualAdmin\.updatedBy/);
  assert.match(rules, /data\.manualAdmin\.updatedAt == request\.time/);
  assert.match(rules, /data\.petPolicy\.diff\(oldData\.petPolicy\)\.affectedKeys\(\)/);
  assert.match(rules, /data\.petPolicy\.petInformationStatus == 'ADMIN_CONFIRMED'/);
  assert.match(rules, /changedTopLevel[\s\S]*affected\.difference/);
  assert.match(rules, /resource\.data\.placeId == placeId[\s\S]*request\.resource\.data\.placeId == placeId/);
  assert.match(rules, /!\('serviceCategory' in data\)[\s\S]*!\('regionArea' in data\)/);
  assert.match(rules, /inputHash\.matches\('\^\[a-f0-9\]\{64\}\$'\)/);
  assert.match(rules, /cannot recompute SHA-256/);
  assert.doesNotMatch(rules, /allow write: if true/);
});
