import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

test('rules statically preserve admin/source/protected-field contracts', () => {
  assert.match(rules, /match \/admins\/\{uid\}[\s\S]*allow get: if isOwner\(uid\);[\s\S]*allow list, create, update, delete: if false;/);
  assert.match(rules, /match \/places\/\{placeId\}[\s\S]*allow create, delete: if false;[\s\S]*allow update: if isActiveAdmin\(\)/);
  assert.match(rules, /match \/sources\/\{sourceId\}[\s\S]*allow write: if false;/);
  assert.match(rules, /let data = request\.resource\.data;[\s\S]*let oldData = resource\.data;[\s\S]*let affected = data\.diff\(oldData\)\.affectedKeys\(\);/);
  assert.match(rules, /let displayAffected = affected\.difference\([\s\S]*'manualAdmin', 'search', 'updatedAt', 'coordinateQualityStatus'/);
  assert.match(rules, /displayAffected\.size\(\) == 22[\s\S]*validCompleteManualAdmin[\s\S]*validPartialManualAdmin/);
  assert.match(rules, /let admin = data\.manualAdmin;[\s\S]*admin\.source == 'ADMIN_UI'/);
  assert.match(rules, /let search = data\.search;[\s\S]*search\.size\(\) == 14[\s\S]*search\.version == 1/);
  assert.match(rules, /admin\.changedFields\.size\(\) == 54[\s\S]*allEditableFieldNames\(\)[\s\S]*admin\.changedFields\.size\(\) == 53[\s\S]*allUserVisibleFieldNames\(\)/);
  assert.doesNotMatch(rules, /manualAdmin\.updatedBy/);
  assert.match(rules, /admin\.updatedAt == request\.time/);
  assert.match(rules, /policy\.diff\(oldPolicy\)\.affectedKeys\(\)/);
  assert.match(rules, /data\.petPolicy\.petInformationStatus == 'ADMIN_CONFIRMED'/);
  assert.match(rules, /changedTopLevel == displayAffected/);
  assert.match(rules, /oldData\.placeId == placeId[\s\S]*data\.placeId == placeId/);
  assert.match(rules, /!\('serviceCategory' in data\)[\s\S]*!\('regionArea' in data\)/);
  assert.match(rules, /inputHash\.matches\('\^\[a-f0-9\]\{64\}\$'\)/);
  assert.match(rules, /cannot recompute SHA-256/);
  assert.doesNotMatch(rules, /allow write: if true/);
});


test('fast paths retain integer totals, editable categories, and single-line image URLs', () => {
  for (const name of ['validSearch', 'validCompleteSearch']) {
    const body = rules.split(`function ${name}(`)[1].split('\n    function ')[0];
    assert.match(body, /search\.totalScore is int/);
  }
  const completeSearch = rules.split('function validCompleteSearch(')[1].split('\n    function ')[0];
  assert.match(completeSearch, /category != 'UNKNOWN'/);
  const completeDisplay = rules.split('function validCompletePlaceDisplay(')[1].split('\n    function ')[0];
  assert.doesNotMatch(completeDisplay, /ImageUrl\.matches\('\(\?s\)/);
});
