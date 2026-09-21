const test = require('node:test');
const assert = require('node:assert/strict');
const { analyseGithubActivity, parseArgs } = require('../scripts/infer-github-skills');

test('GitHub activity produces reviewable skill suggestions', () => {
  const pullRequests = [1, 2, 3].map((number) => ({
    title: `Add API tests ${number}`,
    html_url: `https://github.com/example/service/pull/${number}`,
    state: 'closed',
    pull_request: { url: `https://api.github.com/repos/example/service/pulls/${number}` }
  }));
  const report = analyseGithubActivity({
    profile: { login: 'engineer' },
    repositories: [{
      name: 'cloud-service',
      full_name: 'example/cloud-service',
      description: 'Terraform backend API',
      language: 'TypeScript',
      topics: ['aws'],
      html_url: 'https://github.com/example/cloud-service'
    }],
    authoredPullRequests: pullRequests,
    reviewedPullRequests: [{
      title: 'Review database migration',
      html_url: 'https://github.com/example/service/pull/4'
    }]
  });

  const ids = new Set(report.suggestions.map((suggestion) => suggestion.skillId));
  assert.equal(report.githubUser, 'engineer');
  assert.ok(ids.has('prog_make_a_small_code_change'));
  assert.ok(ids.has('sour_create_a_good_pull_request'));
  assert.ok(ids.has('sour_review_code'));
  assert.ok(ids.has('test_write_unit_tests'));
  assert.ok(ids.has('netw_design_a_basic_api'));
  assert.ok(ids.has('deli_understand_cloud_fundamentals'));
  assert.ok(report.suggestions.every((suggestion) => suggestion.evidence.length > 0));
});

test('GitHub inference command arguments are parsed', () => {
  assert.deepEqual(
    parseArgs(['--login', 'octocat', '--output', 'report.json']),
    { login: 'octocat', output: 'report.json' }
  );
});
