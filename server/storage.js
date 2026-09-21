const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'data');
const usersPath = path.join(dataDir, 'users.json');
const progressPath = path.join(dataDir, 'progress.json');
const datasetPath = path.join(dataDir, 'skill-tree.json');
const sourceDatasetPath = path.join(rootDir, 'software_engineer_skill_tree_v0_7.json');

const categoryToArea = {
  programming: 'core_engineering',
  debugging: 'core_engineering',
  testing: 'core_engineering',
  source_control: 'core_engineering',
  networking: 'backend_engineering',
  data: 'backend_engineering',
  design: 'software_architecture',
  delivery: 'platform_sre',
  security: 'security_engineering',
  engineering_practice: 'core_engineering'
};

function ensureDataFiles() {
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(datasetPath) && fs.existsSync(sourceDatasetPath)) {
    fs.copyFileSync(sourceDatasetPath, datasetPath);
  }

  if (!fs.existsSync(usersPath)) {
    fs.writeFileSync(usersPath, JSON.stringify({ users: {} }, null, 2));
  }

  if (!fs.existsSync(progressPath)) {
    fs.writeFileSync(progressPath, JSON.stringify({ progress: {} }, null, 2));
  }
}

function readJson(filePath, fallbackValue) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw ? JSON.parse(raw) : fallbackValue;
  } catch (error) {
    return fallbackValue;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function parseCookies(cookieHeader = '') {
  const cookies = {};
  if (!cookieHeader) {
    return cookies;
  }

  cookieHeader.split(';').forEach((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) {
      return;
    }
    const index = trimmed.indexOf('=');
    if (index === -1) {
      cookies[trimmed] = '';
      return;
    }
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    cookies[key] = decodeURIComponent(value);
  });

  return cookies;
}

function readCookie(req, key) {
  const cookieHeader = req.headers.cookie || '';
  return parseCookies(cookieHeader)[key] || null;
}

function setAnonymousCookie(res, userId) {
  res.cookie('skilltree_user_id', userId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 365 * 5
  });
}

function loadUsers() {
  return readJson(usersPath, { users: {} }).users || {};
}

function persistUsers(users) {
  writeJson(usersPath, { users });
}

function loadProgress() {
  return readJson(progressPath, { progress: {} }).progress || {};
}

function persistProgress(progress) {
  writeJson(progressPath, { progress });
}

function normalizeSkillTree(skillTree) {
  if (!skillTree || !Array.isArray(skillTree.nodes)) {
    throw new Error('Invalid skill tree dataset.');
  }

  const areas = [...(skillTree.areas || [])];
  const areaIds = new Set(areas.map((area) => area.id));

  if (!areaIds.has('core_engineering')) {
    areas.unshift({
      id: 'core_engineering',
      name: 'Core Engineering',
      description: 'Foundational engineering practices, debugging, quality and collaboration skills.',
      entry_nodes: [],
      future_badge: 'Core Engineer'
    });
  }

  const normalizedNodes = skillTree.nodes.map((node) => ({
    ...node,
    area: node.area || categoryToArea[node.category] || 'core_engineering',
    prerequisites: Array.isArray(node.prerequisites) ? node.prerequisites : [],
    unlocks: Array.isArray(node.unlocks) ? node.unlocks : [],
    learning_resources: Array.isArray(node.learning_resources) ? node.learning_resources : [],
    evidence_examples: Array.isArray(node.evidence_examples) ? node.evidence_examples : []
  }));

  return { ...skillTree, areas, nodes: normalizedNodes };
}

function loadSkillTree() {
  ensureDataFiles();
  const fileToLoad = fs.existsSync(datasetPath) ? datasetPath : sourceDatasetPath;
  const skillTree = readJson(fileToLoad, { meta: {}, categories: [], resources: [], nodes: [], milestones: [], areas: [], badges: [] });
  return normalizeSkillTree(skillTree);
}

function getOrCreateAnonymousUser(req, res) {
  ensureDataFiles();
  const users = loadUsers();
  const existingUserId = readCookie(req, 'skilltree_user_id');

  if (existingUserId && users[existingUserId]) {
    return users[existingUserId];
  }

  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const user = {
    id: userId,
    type: 'anonymous',
    createdAt: now,
    updatedAt: now
  };

  users[userId] = user;
  persistUsers(users);
  setAnonymousCookie(res, userId);

  return user;
}

module.exports = {
  ensureDataFiles,
  getOrCreateAnonymousUser,
  loadSkillTree,
  loadUsers,
  loadProgress,
  persistProgress,
  readCookie,
  setAnonymousCookie,
  normalizeSkillTree
};
