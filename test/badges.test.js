const test = require('node:test');
const assert = require('node:assert/strict');
const tree = require('../data/skill-tree.json');
const { computeBadgeStatus } = require('../server/server');

test('every badge has an active progress target', () => {
  const badges = computeBadgeStatus(tree, new Set());

  assert.equal(badges.length, tree.badges.length);
  for (const badge of badges) {
    assert.equal(badge.earned, false);
    assert.equal(badge.status, 'locked');
    assert.ok(badge.progress.target > 0, `${badge.id} should have a target`);
  }
});

test('specialisation badge targets match their skill trees', () => {
  const badges = computeBadgeStatus(tree, new Set());
  const backend = badges.find((badge) => badge.id === 'badge_backend');
  const backendSkills = tree.nodes.filter((node) => node.area === 'backend_engineering');

  assert.equal(backend.progress.target, backendSkills.length);
  assert.equal(backend.progress.label, `0 / ${backendSkills.length} skills`);
});

test('completing every skill earns every badge', () => {
  const completed = new Set(tree.nodes.map((node) => node.id));
  const badges = computeBadgeStatus(tree, completed);

  assert.ok(badges.every((badge) => badge.earned));
  assert.ok(badges.every((badge) => badge.status === 'earned'));
});
