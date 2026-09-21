const test = require('node:test');
const assert = require('node:assert/strict');
const tree = require('../data/skill-tree.json');
const {
  buildProgressSnapshot,
  calculateSkillXp,
  parseSkillProgressInput
} = require('../server/server');

test('legacy completions migrate to self-assessed progress', () => {
  const skill = tree.nodes[0];
  const snapshot = buildProgressSnapshot('test-user', tree, {
    completedSkills: [skill.id],
    updatedAt: '2026-01-01T00:00:00.000Z'
  });
  const migrated = snapshot.nodes.find((node) => node.id === skill.id);

  assert.equal(migrated.progressStatus, 'self_assessed');
  assert.equal(migrated.confidence, 2);
  assert.equal(snapshot.selfAssessedCount, 1);
  assert.equal(snapshot.evidencedCount, 0);
});

test('evidenced progress earns more XP than self-assessment', () => {
  const skill = tree.nodes.find((node) => node.tier === 2) || tree.nodes[0];
  const selfAssessed = calculateSkillXp(skill, { status: 'self_assessed', confidence: 2 });
  const evidenced = calculateSkillXp(skill, { status: 'evidenced', confidence: 2 });

  assert.ok(evidenced > selfAssessed);
});

test('evidence links must be valid web URLs', () => {
  assert.equal(parseSkillProgressInput({ evidenceUrl: 'not-a-url' }).error, 'Evidence must be a valid URL');
  assert.ok(parseSkillProgressInput({ evidenceUrl: 'https://github.com/example/project' }).record);
});

test('a fully evidenced graph derives Staff progression', () => {
  const skillProgress = Object.fromEntries(tree.nodes.map((node) => [node.id, {
    status: 'evidenced',
    confidence: 4,
    evidence: [{ url: 'https://example.com/evidence' }]
  }]));
  const snapshot = buildProgressSnapshot('test-user', tree, { skillProgress });

  assert.equal(snapshot.careerLevel.id, 'staff');
  assert.equal(snapshot.evidencedCount, tree.nodes.length);
  assert.ok(snapshot.totalXp > 0);
});
