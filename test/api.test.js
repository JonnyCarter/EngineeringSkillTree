const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');
const datasetPath = path.join(rootDir, 'data', 'skill-tree.json');

test('the skill tree dataset exists and is valid JSON', () => {
  assert.ok(fs.existsSync(datasetPath), 'data/skill-tree.json should exist');

  const raw = fs.readFileSync(datasetPath, 'utf8');
  const dataset = JSON.parse(raw);

  assert.ok(Array.isArray(dataset.nodes), 'dataset should contain a nodes array');
  assert.ok(dataset.nodes.length > 0, 'dataset should include at least one skill node');
  assert.ok(Array.isArray(dataset.areas), 'dataset should include areas');
});
