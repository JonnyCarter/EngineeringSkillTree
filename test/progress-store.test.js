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

test('evidence and progress survive an export/import round trip', () => {
  const skill = tree.nodes[0];
  store.save(tree, skill.id, {
    confidence: 4,
    evidenceUrl: 'https://github.com/example/project',
    evidenceLabel: 'Example project'
  });
  const exported = store.export(tree);
  store.reset();
  store.import(tree, exported);
  const result = store.build(tree);

  assert.equal(result.progress.evidencedCount, 1);
  assert.equal(result.progress.skillProgress[skill.id].evidence[0].label, 'Example project');
});

test('unsafe evidence URLs are rejected', () => {
  assert.throws(
    () => store.save(tree, tree.nodes[0].id, { evidenceUrl: 'javascript:alert(1)' }),
    /valid http or https URL/
  );
});

test('completing every skill earns every badge', () => {
  for (const skill of tree.nodes) store.save(tree, skill.id, { confidence: 2 });
  assert.ok(store.build(tree).badges.every((badge) => badge.earned));
});
