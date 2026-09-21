const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');


const rootDir = path.join(__dirname, '..');
const tree = require(path.join(rootDir, 'public', 'data', 'skill-tree.json'));

const keywordRules = [
  { skillId: 'test_write_unit_tests', pattern: /\b(test|tests|testing|spec|coverage)\b/i, reason: 'Authored work references tests or coverage.' },
  { skillId: 'engi_write_technical_documentation', pattern: /\b(docs?|documentation|readme|runbook|adr)\b/i, reason: 'Authored work references technical documentation.' },
  { skillId: 'netw_design_a_basic_api', pattern: /\b(api|endpoint|rest|graphql|webhook)\b/i, reason: 'Authored work references an API or endpoint.' },
  { skillId: 'deli_deploy_a_change', pattern: /\b(deploy|release|rollout|production|prod)\b/i, reason: 'Authored work references deployment or release activity.' },
  { skillId: 'deli_understand_ci', pattern: /\b(ci|pipeline|github actions|continuous integration)\b/i, reason: 'Authored work references continuous integration.' },
  { skillId: 'secu_understand_common_vulnerabilities', pattern: /\b(security|vulnerability|cve|xss|csrf|injection|secret)\b/i, reason: 'Authored work references application security.' },
  { skillId: 'data_write_basic_sql', pattern: /\b(sql|query|postgres|mysql|database)\b/i, reason: 'Authored work references relational data or SQL.' },
  { skillId: 'data_perform_data_migrations', pattern: /\b(migration|schema change|backfill)\b/i, reason: 'Authored work references a data migration.' },
  { skillId: 'deli_use_containers', pattern: /\b(docker|container|containerise|containerize)\b/i, reason: 'Authored work references containers.' },
  { skillId: 'deli_understand_cloud_fundamentals', pattern: /\b(aws|azure|gcp|cloud|terraform)\b/i, reason: 'Authored work references cloud infrastructure.' },
  { skillId: 'aien_use_a_model_api', pattern: /\b(openai|llm|model api|generative ai|embedding)\b/i, reason: 'Authored work references an AI model API.' },
  { skillId: 'frnt_manage_frontend_state', pattern: /\b(react|vue|angular|frontend|client state)\b/i, reason: 'Repository activity indicates frontend application work.' },
  { skillId: 'back_structure_a_backend_application', pattern: /\b(backend|server|express|django|rails|spring)\b/i, reason: 'Repository activity indicates backend application work.' }
];

function parseArgs(args) {
  const options = { login: null, output: null };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--login') {
      options.login = args[index + 1] || null;
      index += 1;
    } else if (args[index] === '--output') {
      options.output = args[index + 1] || null;
      index += 1;
    } else if (args[index] === '--help' || args[index] === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${args[index]}`);
    }
  }
  return options;
}

function runGh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (result.error?.code === 'ENOENT') {
    throw new Error('GitHub CLI is not installed. Install it from https://cli.github.com/ and run `gh auth login`.');
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'GitHub CLI request failed').trim());
  }
  return result.stdout;
}

function ghJson(args) {
  return JSON.parse(runGh(args));
}

function evidenceFromItem(item, type) {
  return {
    type,
    label: item.title || item.name || item.full_name,
    url: item.html_url
  };
}

function addSuggestion(suggestions, skillsById, skillId, reason, evidence, weight = 1) {
  const skill = skillsById.get(skillId);
  if (!skill || !evidence?.url) {
    return;
  }
  if (!suggestions.has(skillId)) {
    suggestions.set(skillId, { skill, score: 0, reasons: new Set(), evidence: new Map() });
  }
  const suggestion = suggestions.get(skillId);
  suggestion.score += weight;
  suggestion.reasons.add(reason);
  suggestion.evidence.set(evidence.url, evidence);
}

function analyseGithubActivity({ profile, repositories = [], authoredPullRequests = [], reviewedPullRequests = [] }) {
  const skillsById = new Map(tree.nodes.map((node) => [node.id, node]));
  const suggestions = new Map();
  const mergedPullRequests = authoredPullRequests.filter((item) => item.pull_request && item.state === 'closed');

  for (const pullRequest of mergedPullRequests) {
    const evidence = evidenceFromItem(pullRequest, 'pull_request');
    addSuggestion(suggestions, skillsById, 'prog_make_a_small_code_change', 'Authored a merged or closed pull request.', evidence, 1);
    if (mergedPullRequests.length >= 3) {
      addSuggestion(suggestions, skillsById, 'sour_create_a_good_pull_request', 'Authored several pull requests.', evidence, 1);
    }
  }

  for (const pullRequest of reviewedPullRequests) {
    const evidence = evidenceFromItem(pullRequest, 'reviewed_pull_request');
    addSuggestion(suggestions, skillsById, 'sour_review_code', 'Reviewed another pull request.', evidence, 1);
    addSuggestion(suggestions, skillsById, 'comm_review_code_constructively', 'Participated in pull-request review.', evidence, 0.5);
  }

  const searchableItems = [
    ...authoredPullRequests.map((item) => ({ ...item, evidenceType: 'pull_request' })),
    ...repositories.map((item) => ({ ...item, evidenceType: 'repository' }))
  ];

  for (const item of searchableItems) {
    const text = [
      item.title,
      item.name,
      item.full_name,
      item.description,
      item.language,
      ...(item.topics || [])
    ].filter(Boolean).join(' ');
    const evidence = evidenceFromItem(item, item.evidenceType);
    for (const rule of keywordRules) {
      if (rule.pattern.test(text)) {
        addSuggestion(suggestions, skillsById, rule.skillId, rule.reason, evidence, 1);
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    githubUser: profile.login,
    scope: {
      repositoriesExamined: repositories.length,
      authoredPullRequestsExamined: authoredPullRequests.length,
      reviewedPullRequestsExamined: reviewedPullRequests.length
    },
    caveats: [
      'GitHub activity is evidence to review, not proof of competence.',
      'Private activity appears only when the authenticated gh token can access it.',
      'Repository metadata and PR titles can produce false positives; confirm every suggestion before recording progress.'
    ],
    suggestions: [...suggestions.values()]
      .map((suggestion) => ({
        skillId: suggestion.skill.id,
        skillName: suggestion.skill.name,
        tier: suggestion.skill.tier,
        suggestedConfidence: suggestion.score >= 3 ? 2 : 1,
        score: suggestion.score,
        reasons: [...suggestion.reasons],
        evidence: [...suggestion.evidence.values()].slice(0, 3)
      }))
      .sort((a, b) => b.score - a.score || a.skillName.localeCompare(b.skillName))
  };
}

function fetchGithubActivity(requestedLogin) {
  runGh(['auth', 'status']);
  const viewer = ghJson(['api', 'user']);
  const login = requestedLogin || viewer.login;
  const ownAccount = login.toLowerCase() === viewer.login.toLowerCase();
  const repositoryEndpoint = ownAccount
    ? 'user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member'
    : `users/${encodeURIComponent(login)}/repos?per_page=100&sort=updated&type=owner`;
  const repositories = ghJson(['api', repositoryEndpoint]);
  const authored = ghJson(['api', 'search/issues', '-X', 'GET', '-f', `q=author:${login} type:pr`, '-f', 'per_page=100', '-f', 'sort=updated']);
  const reviewed = ghJson(['api', 'search/issues', '-X', 'GET', '-f', `q=reviewed-by:${login} type:pr -author:${login}`, '-f', 'per_page=100', '-f', 'sort=updated']);

  return {
    profile: ownAccount ? viewer : { login },
    repositories,
    authoredPullRequests: authored.items || [],
    reviewedPullRequests: reviewed.items || []
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: npm run infer:github -- [--login USER] [--output REPORT.json]');
    return;
  }

  const report = analyseGithubActivity(fetchGithubActivity(options.login));
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    fs.writeFileSync(path.resolve(options.output), output);
    console.log(`GitHub skill suggestions written to ${path.resolve(options.output)}`);
  } else {
    process.stdout.write(output);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`GitHub skill inference failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { analyseGithubActivity, parseArgs };
