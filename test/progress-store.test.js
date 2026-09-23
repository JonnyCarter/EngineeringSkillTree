const test = require('node:test');
const assert = require('node:assert/strict');
const tree = require('../public/data/skill-tree.json');

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

global.localStorage = createStorage();
const store = require('../public/js/progress-store');

test.beforeEach(() => {
  global.localStorage = createStorage();
});

test('saving progress updates the graph snapshot', () => {
  const skill = tree.nodes[0];
  store.save(tree, skill.id, { confidence: 3 });
  const result = store.build(tree);
  const saved = result.nodes.find((node) => node.id === skill.id);

  assert.equal(saved.progressStatus, 'self_assessed');
  assert.equal(saved.confidence, 3);
  assert.equal(result.progress.completedCount, 1);
});

test('progress survives an export/import round trip', () => {
  const skill = tree.nodes[0];
  store.save(tree, skill.id, { confidence: 4 });
  const exported = store.export(tree);
  store.reset();
  store.import(tree, exported);
  const result = store.build(tree);

  assert.equal(result.progress.completedCount, 1);
  assert.equal(result.progress.skillProgress[skill.id].confidence, 4);
});

test('legacy evidence is reduced to a self-assessment on import', () => {
  const skill = tree.nodes[0];
  store.import(tree, {
    format: 'engineering-skill-tree-progress',
    version: 1,
    progress: { skillProgress: { [skill.id]: { confidence: 3, evidence: [{ url: 'https://example.com' }] } } }
  });

  const record = store.build(tree).progress.skillProgress[skill.id];
  assert.equal(record.status, 'self_assessed');
  assert.equal('evidence' in record, false);
});

test('completing every skill earns every badge', () => {
  for (const skill of tree.nodes) store.save(tree, skill.id, { confidence: 2 });
  assert.ok(store.build(tree).badges.every((badge) => badge.earned));
});
