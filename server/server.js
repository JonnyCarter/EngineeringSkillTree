const express = require('express');
const path = require('node:path');
const {
  getOrCreateAnonymousUser,
  loadSkillTree,
  loadProgress,
  persistProgress
} = require('./storage');

const app = express();
const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, '..', 'public');
const nodeModulesDir = path.join(__dirname, '..', 'node_modules');
const pidPath = path.join(__dirname, '..', '.skilltree-server.pid');

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use('/vendor/cytoscape', express.static(path.join(nodeModulesDir, 'cytoscape', 'dist')));
app.use('/vendor/cytoscape-dagre', express.static(path.join(nodeModulesDir, 'cytoscape-dagre', 'dist')));
app.use(express.static(publicDir));

function getSkillState(skill, completedSet) {
  if (completedSet.has(skill.id)) {
    return 'completed';
  }

  const prerequisites = Array.isArray(skill.prerequisites) ? skill.prerequisites : [];
  if (prerequisites.length === 0) {
    return 'available';
  }

  return prerequisites.every((prereqId) => completedSet.has(prereqId)) ? 'available' : 'locked';
}

const confidenceLabels = {
  1: 'Guided',
  2: 'Independent',
  3: 'Ownership',
  4: 'Leadership'
};

const tierXp = { 1: 25, 2: 50, 3: 75, 4: 100 };
const confidenceMultipliers = { 1: 0.7, 2: 0.85, 3: 1, 4: 1.15 };

function isSafeEvidenceUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function normalizeSkillProgress(tree, progressData = {}) {
  const validIds = new Set(tree.nodes.map((node) => node.id));
  const records = {};

  for (const [skillId, record] of Object.entries(progressData.skillProgress || {})) {
    if (!validIds.has(skillId) || !record || typeof record !== 'object') {
      continue;
    }
    const confidence = Math.max(1, Math.min(4, Number(record.confidence) || 2));
    const evidence = Array.isArray(record.evidence)
      ? record.evidence
        .filter((item) => item && typeof item.url === 'string' && item.url.length <= 2048 && isSafeEvidenceUrl(item.url))
        .slice(0, 20)
        .map((item) => ({
          url: item.url,
          label: String(item.label || 'Project evidence').slice(0, 120),
          createdAt: item.createdAt || null
        }))
      : [];
    records[skillId] = {
      status: evidence.length ? 'evidenced' : 'self_assessed',
      confidence,
      evidence,
      updatedAt: record.updatedAt || progressData.updatedAt || null
    };
  }

  for (const skillId of progressData.completedSkills || []) {
    if (validIds.has(skillId) && !records[skillId]) {
      records[skillId] = {
        status: 'self_assessed',
        confidence: 2,
        evidence: [],
        updatedAt: progressData.updatedAt || null
      };
    }
  }

  return records;
}

function calculateSkillXp(skill, record) {
  if (!record) {
    return 0;
  }
  const base = tierXp[Number(skill.tier) || 1] || tierXp[1];
  const evidenceMultiplier = record.status === 'evidenced' ? 1 : 0.5;
  const confidenceMultiplier = confidenceMultipliers[record.confidence] || confidenceMultipliers[2];
  return Math.round(base * evidenceMultiplier * confidenceMultiplier);
}

function getAreaSummary(tree, completedSet, skillProgress) {
  const summary = {};

  for (const area of tree.areas) {
    const areaNodes = tree.nodes.filter((node) => (node.area || 'core_engineering') === area.id);
    const completed = areaNodes.filter((node) => completedSet.has(node.id)).length;
    const evidenced = areaNodes.filter((node) => skillProgress[node.id]?.status === 'evidenced').length;
    summary[area.id] = {
      id: area.id,
      name: area.name,
      total: areaNodes.length,
      completed,
      evidenced,
      percent: areaNodes.length ? Math.round((completed / areaNodes.length) * 100) : 0
    };
  }

  return summary;
}

function buildMilestoneProgress(tree, completedSet) {
  return (tree.milestones || []).map((milestone) => {
    const required = milestone.requires || [];
    const completed = required.filter((id) => completedSet.has(id)).length;
    return {
      id: milestone.id,
      name: milestone.name,
      tier: milestone.tier,
      completed,
      target: required.length,
      earned: required.length > 0 && completed === required.length
    };
  });
}

function deriveCareerLevel(milestones, evidencedCount) {
  const earned = milestones.filter((milestone) => milestone.earned);
  const tierOne = earned.filter((milestone) => Number(milestone.tier) === 1).length;
  const throughTierTwo = earned.filter((milestone) => Number(milestone.tier) <= 2).length;
  const tierThree = earned.filter((milestone) => Number(milestone.tier) === 3).length;
  const tierFour = earned.filter((milestone) => Number(milestone.tier) === 4).length;

  if (tierFour >= 3 && evidencedCount >= 20) {
    return { id: 'staff', name: 'Staff', next: null };
  }
  if (tierThree >= 3 && evidencedCount >= 10) {
    return { id: 'senior', name: 'Senior', next: 'Staff' };
  }
  if (throughTierTwo >= 3) {
    return { id: 'engineer', name: 'Engineer', next: 'Senior' };
  }
  if (tierOne >= 1) {
    return { id: 'junior', name: 'Junior', next: 'Engineer' };
  }
  return { id: 'foundation', name: 'Foundation', next: 'Junior' };
}

function buildProgressSnapshot(userId, tree, progressData) {
  const skillProgress = normalizeSkillProgress(tree, progressData);
  const completedSkills = new Set(Object.keys(skillProgress));
  const nodes = tree.nodes.map((node) => ({
    ...node,
    state: getSkillState(node, completedSkills),
    isCompleted: completedSkills.has(node.id),
    isAvailable: getSkillState(node, completedSkills) === 'available',
    isLocked: getSkillState(node, completedSkills) === 'locked',
    progressStatus: skillProgress[node.id]?.status || 'not_started',
    confidence: skillProgress[node.id]?.confidence || null,
    confidenceLabel: confidenceLabels[skillProgress[node.id]?.confidence] || null,
    evidence: skillProgress[node.id]?.evidence || [],
    xp: calculateSkillXp(node, skillProgress[node.id])
  }));

  const availableSkills = nodes.filter((node) => node.state === 'available');
  const completedCount = completedSkills.size;
  const evidencedCount = nodes.filter((node) => node.progressStatus === 'evidenced').length;
  const selfAssessedCount = completedCount - evidencedCount;
  const totalSkills = nodes.length;
  const milestones = buildMilestoneProgress(tree, completedSkills);

  return {
    userId,
    completedSkills: [...completedSkills],
    completedCount,
    selfAssessedCount,
    evidencedCount,
    totalXp: nodes.reduce((sum, node) => sum + node.xp, 0),
    careerLevel: deriveCareerLevel(milestones, evidencedCount),
    milestones,
    skillProgress,
    totalSkills,
    percentage: totalSkills ? Math.round((completedCount / totalSkills) * 100) : 0,
    availableCount: availableSkills.length,
    lockedCount: nodes.filter((node) => node.state === 'locked').length,
    areas: getAreaSummary(tree, completedSkills, skillProgress),
    nodes
  };
}

function validateSkillId(tree, skillId) {
  const skill = tree.nodes.find((node) => node.id === skillId);
  if (!skill) {
    return null;
  }
  return skill;
}

const badgeAreaIds = {
  badge_security_path: 'security_engineering',
  badge_architecture_path: 'software_architecture',
  badge_backend: 'backend_engineering',
  badge_frontend: 'frontend_engineering',
  badge_platform_sre: 'platform_sre',
  badge_cloud: 'cloud_engineering',
  badge_ai_engineering: 'ai_engineering',
  badge_communication_collaboration: 'communication_collaboration',
  badge_delivery_ways_of_working: 'delivery_ways_of_working',
  badge_product_engineering: 'product_engineering',
  badge_technical_leadership: 'technical_leadership'
};

function milestoneIsComplete(milestone, completedSet) {
  const requiredSkills = Array.isArray(milestone?.requires) ? milestone.requires : [];
  return requiredSkills.length > 0 && requiredSkills.every((id) => completedSet.has(id));
}

function evaluateDefaultBadge(badge, completedSet, tree) {
  const areaId = badgeAreaIds[badge.id];
  if (areaId) {
    const area = tree.areas.find((candidate) => candidate.id === areaId);
    const skills = tree.nodes.filter((node) => (node.area || 'core_engineering') === areaId);
    const current = skills.filter((node) => completedSet.has(node.id)).length;
    const target = skills.length;
    return {
      status: target > 0 && current >= target ? 'earned' : 'locked',
      earned: target > 0 && current >= target,
      description: `Complete every skill in ${area?.name || badge.name}.`,
      progress: { current, target, label: `${current} / ${target} skills` }
    };
  }

  const careerMilestones = (tree.milestones || []).filter((milestone) => {
    if (badge.id === 'badge_junior_engineer') {
      return Number(milestone.tier) <= 2;
    }
    if (badge.id === 'badge_senior_engineer') {
      return Number(milestone.tier) >= 4;
    }
    return false;
  });

  if (careerMilestones.length) {
    const current = careerMilestones.filter((milestone) => milestoneIsComplete(milestone, completedSet)).length;
    const target = careerMilestones.length;
    const level = badge.id === 'badge_junior_engineer' ? 'foundation and independent' : 'system and leadership';
    return {
      status: current >= target ? 'earned' : 'locked',
      earned: current >= target,
      description: `Complete all ${level} capability milestones.`,
      progress: { current, target, label: `${current} / ${target} milestones` }
    };
  }

  return {
    status: 'placeholder',
    earned: false,
    progress: { current: 0, target: 0, label: 'Requirements pending' }
  };
}

function evaluateBadgeRequirements(badge, completedSet, tree) {
  const rules = Array.isArray(badge.requirements) ? badge.requirements : [];
  if (!rules.length) {
    return evaluateDefaultBadge(badge, completedSet, tree);
  }

  let current = 0;
  let target = 0;

  for (const rule of rules) {
    target += 1;

    if (rule.type === 'skill_all') {
      const allMet = Array.isArray(rule.skill_ids) && rule.skill_ids.every((id) => completedSet.has(id));
      if (allMet) {
        current += 1;
      }
      continue;
    }

    if (rule.type === 'skill_count') {
      const count = Array.isArray(rule.skill_ids) ? rule.skill_ids.filter((id) => completedSet.has(id)).length : 0;
      current += count >= (rule.min || 0) ? 1 : 0;
      continue;
    }

    if (rule.type === 'area_minimum') {
      const requiredValue = Number(rule.minimum || 0);
      const count = rule.skill_ids ? rule.skill_ids.filter((id) => completedSet.has(id)).length : 0;
      current += count >= requiredValue ? 1 : 0;
      continue;
    }

    if (rule.type === 'milestone_required') {
      const milestoneIds = new Set(rule.milestone_ids || []);
      const requiredMilestones = (tree.milestones || []).filter((milestone) => milestoneIds.has(milestone.id));
      const milestoneMet = requiredMilestones.length === milestoneIds.size
        && requiredMilestones.every((milestone) => milestoneIsComplete(milestone, completedSet));
      if (milestoneMet) {
        current += 1;
      }
    }
  }

  const earned = current >= target;

  return {
    status: earned ? 'earned' : 'locked',
    earned,
    progress: {
      current,
      target,
      label: `${current} / ${target}`
    }
  };
}

function computeBadgeStatus(tree, completedSet) {
  return (tree.badges || []).map((badge) => {
    const evaluation = evaluateBadgeRequirements(badge, completedSet, tree);
    return {
      ...badge,
      ...evaluation,
      displayStatus: evaluation.status
    };
  });
}

app.get('/api/me', (req, res) => {
  const user = getOrCreateAnonymousUser(req, res);
  const tree = loadSkillTree();
  const progressData = loadProgress();
  const snapshot = buildProgressSnapshot(user.id, tree, progressData[user.id] || { completedSkills: [] });

  res.json({
    user: {
      id: user.id,
      type: user.type,
      createdAt: user.createdAt
    },
    progress: snapshot
  });
});

app.get('/api/tree', (req, res) => {
  const user = getOrCreateAnonymousUser(req, res);
  const tree = loadSkillTree();
  const progressData = loadProgress();
  const snapshot = buildProgressSnapshot(user.id, tree, progressData[user.id] || { completedSkills: [] });

  res.json({
    meta: tree.meta,
    categories: tree.categories,
    areas: tree.areas,
    resources: tree.resources,
    milestones: tree.milestones,
    badges: computeBadgeStatus(tree, new Set(snapshot.completedSkills)),
    nodes: snapshot.nodes,
    progress: snapshot
  });
});

app.get('/api/progress', (req, res) => {
  const user = getOrCreateAnonymousUser(req, res);
  const tree = loadSkillTree();
  const progressData = loadProgress();
  const snapshot = buildProgressSnapshot(user.id, tree, progressData[user.id] || { completedSkills: [] });

  res.json({
    userId: user.id,
    progress: snapshot,
    badges: computeBadgeStatus(tree, new Set(snapshot.completedSkills))
  });
});

app.get('/api/progress/export', (req, res) => {
  const user = getOrCreateAnonymousUser(req, res);
  const tree = loadSkillTree();
  const progressData = loadProgress();
  const current = progressData[user.id] || { completedSkills: [] };
  const skillProgress = normalizeSkillProgress(tree, current);
  const exportedAt = new Date().toISOString();

  res.setHeader('Content-Disposition', `attachment; filename="skilltree-progress-${exportedAt.slice(0, 10)}.json"`);
  res.json({
    format: 'engineering-skill-tree-progress',
    version: 1,
    datasetVersion: tree.meta?.version || null,
    exportedAt,
    progress: {
      completedSkills: Object.keys(skillProgress),
      skillProgress
    }
  });
});

app.post('/api/progress/import', (req, res) => {
  const user = getOrCreateAnonymousUser(req, res);
  const tree = loadSkillTree();
  const payload = req.body;

  if (!payload || payload.format !== 'engineering-skill-tree-progress' || payload.version !== 1 || !payload.progress) {
    return res.status(400).json({ error: 'Unsupported or invalid progress export' });
  }

  const skillProgress = normalizeSkillProgress(tree, payload.progress);
  if (!Object.keys(skillProgress).length && Object.keys(payload.progress.skillProgress || {}).length) {
    return res.status(400).json({ error: 'Import does not contain recognised skill progress' });
  }

  const progressData = loadProgress();
  const importedAt = new Date().toISOString();
  progressData[user.id] = {
    userId: user.id,
    completedSkills: Object.keys(skillProgress),
    skillProgress,
    importedAt,
    updatedAt: importedAt
  };
  persistProgress(progressData);

  return res.json({
    message: `Imported ${Object.keys(skillProgress).length} skill records`,
    progress: buildProgressSnapshot(user.id, tree, progressData[user.id])
  });
});

app.get('/api/badges', (req, res) => {
  const user = getOrCreateAnonymousUser(req, res);
  const tree = loadSkillTree();
  const progressData = loadProgress();
  const snapshot = buildProgressSnapshot(user.id, tree, progressData[user.id] || { completedSkills: [] });

  res.json({
    userId: user.id,
    badges: computeBadgeStatus(tree, new Set(snapshot.completedSkills))
  });
});

function parseSkillProgressInput(body = {}, existingRecord = null) {
  const confidence = Math.max(1, Math.min(4, Number(body.confidence) || existingRecord?.confidence || 2));
  const evidenceUrl = typeof body.evidenceUrl === 'string' ? body.evidenceUrl.trim() : '';
  const evidenceLabel = typeof body.evidenceLabel === 'string' ? body.evidenceLabel.trim().slice(0, 120) : '';

  if (evidenceUrl.length > 2048) {
    return { error: 'Evidence URL is too long' };
  }

  if (evidenceUrl) {
    try {
      const parsed = new URL(evidenceUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { error: 'Evidence must use an http or https URL' };
      }
    } catch {
      return { error: 'Evidence must be a valid URL' };
    }
  }

  const evidence = evidenceUrl
    ? [{ url: evidenceUrl, label: evidenceLabel || 'Project evidence', createdAt: new Date().toISOString() }]
    : [];

  return {
    record: {
      status: evidence.length ? 'evidenced' : 'self_assessed',
      confidence,
      evidence,
      updatedAt: new Date().toISOString()
    }
  };
}

app.post('/api/skills/:id/complete', (req, res) => {
  const user = getOrCreateAnonymousUser(req, res);
  const tree = loadSkillTree();
  const skill = validateSkillId(tree, req.params.id);

  if (!skill) {
    return res.status(404).json({ error: 'Skill not found', skillId: req.params.id });
  }

  const progressData = loadProgress();
  const userProgress = progressData[user.id] || { userId: user.id, completedSkills: [] };
  const skillProgress = normalizeSkillProgress(tree, userProgress);
  const parsed = parseSkillProgressInput(req.body, skillProgress[skill.id]);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error, skillId: skill.id });
  }

  skillProgress[skill.id] = parsed.record;
  userProgress.skillProgress = skillProgress;
  userProgress.completedSkills = Object.keys(skillProgress);
  userProgress.updatedAt = new Date().toISOString();
  progressData[user.id] = userProgress;
  persistProgress(progressData);

  return res.json({
    message: parsed.record.status === 'evidenced' ? 'Skill saved with evidence' : 'Skill self-assessment saved',
    skillId: skill.id,
    progress: buildProgressSnapshot(user.id, tree, userProgress)
  });
});

app.delete('/api/skills/:id/complete', (req, res) => {
  const user = getOrCreateAnonymousUser(req, res);
  const tree = loadSkillTree();
  const skill = validateSkillId(tree, req.params.id);

  if (!skill) {
    return res.status(404).json({ error: 'Skill not found', skillId: req.params.id });
  }

  const progressData = loadProgress();
  const userProgress = progressData[user.id] || { userId: user.id, completedSkills: [] };
  const skillProgress = normalizeSkillProgress(tree, userProgress);
  delete skillProgress[skill.id];

  userProgress.skillProgress = skillProgress;
  userProgress.completedSkills = Object.keys(skillProgress);
  userProgress.updatedAt = new Date().toISOString();
  progressData[user.id] = userProgress;
  persistProgress(progressData);

  return res.json({
    message: 'Skill marked as not completed',
    skillId: skill.id,
    progress: buildProgressSnapshot(user.id, tree, userProgress)
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

if (require.main === module) {
  const server = app.listen(port, () => {
    require('node:fs').writeFileSync(pidPath, String(process.pid));
    console.log(`Skill tree app running at http://localhost:${port}`);
  });

  const removePidFile = () => {
    const fs = require('node:fs');
    try {
      if (fs.readFileSync(pidPath, 'utf8').trim() === String(process.pid)) {
        fs.unlinkSync(pidPath);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Could not remove server PID file: ${error.message}`);
      }
    }
  };

  const shutdown = (signal) => {
    console.log(`Received ${signal}; stopping Skill Tree server.`);
    server.close(() => process.exit(0));
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('exit', removePidFile);
}

module.exports = {
  app,
  buildProgressSnapshot,
  calculateSkillXp,
  computeBadgeStatus,
  deriveCareerLevel,
  evaluateBadgeRequirements,
  normalizeSkillProgress,
  parseSkillProgressInput
};
