(function () {
  const STORAGE_KEY = 'engineering-skill-tree-progress-v1';
  const FORMAT = 'engineering-skill-tree-progress';
  const tierXp = { 1: 25, 2: 50, 3: 75, 4: 100 };
  const confidenceMultipliers = { 1: 0.7, 2: 0.85, 3: 1, 4: 1.15 };
  const confidenceLabels = { 1: 'Guided', 2: 'Independent', 3: 'Ownership', 4: 'Leadership' };
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

  function isSafeUrl(value) {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }

  function normalize(tree, data = {}) {
    const validIds = new Set(tree.nodes.map((node) => node.id));
    const records = {};
    for (const [skillId, record] of Object.entries(data.skillProgress || {})) {
      if (!validIds.has(skillId) || !record || typeof record !== 'object') continue;
      const evidence = Array.isArray(record.evidence) ? record.evidence
        .filter((item) => item && typeof item.url === 'string' && item.url.length <= 2048 && isSafeUrl(item.url))
        .slice(0, 20)
        .map((item) => ({
          url: item.url,
          label: String(item.label || 'Project evidence').slice(0, 120),
          createdAt: item.createdAt || null
        })) : [];
      records[skillId] = {
        status: evidence.length ? 'evidenced' : 'self_assessed',
        confidence: Math.max(1, Math.min(4, Number(record.confidence) || 2)),
        evidence,
        updatedAt: record.updatedAt || null
      };
    }
    for (const skillId of data.completedSkills || []) {
      if (validIds.has(skillId) && !records[skillId]) {
        records[skillId] = { status: 'self_assessed', confidence: 2, evidence: [], updatedAt: null };
      }
    }
    return records;
  }

  function load(tree) {
    try {
      return normalize(tree, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
    } catch {
      return {};
    }
  }

  function persist(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      completedSkills: Object.keys(records),
      skillProgress: records,
      updatedAt: new Date().toISOString()
    }));
  }

  function getSkillState(skill, completed) {
    if (completed.has(skill.id)) return 'completed';
    return (skill.prerequisites || []).every((id) => completed.has(id)) ? 'available' : 'locked';
  }

  function milestones(tree, completed) {
    return (tree.milestones || []).map((item) => {
      const required = item.requires || [];
      const count = required.filter((id) => completed.has(id)).length;
      return { ...item, completed: count, target: required.length, earned: required.length > 0 && count === required.length };
    });
  }

  function careerLevel(items, evidencedCount) {
    const earned = items.filter((item) => item.earned);
    if (earned.filter((item) => Number(item.tier) === 4).length >= 3 && evidencedCount >= 20) return { id: 'staff', name: 'Staff', next: null };
    if (earned.filter((item) => Number(item.tier) === 3).length >= 3 && evidencedCount >= 10) return { id: 'senior', name: 'Senior', next: 'Staff' };
    if (earned.filter((item) => Number(item.tier) <= 2).length >= 3) return { id: 'engineer', name: 'Engineer', next: 'Senior' };
    if (earned.some((item) => Number(item.tier) === 1)) return { id: 'junior', name: 'Junior', next: 'Engineer' };
    return { id: 'foundation', name: 'Foundation', next: 'Junior' };
  }

  function snapshot(tree, records) {
    const completed = new Set(Object.keys(records));
    const nodes = tree.nodes.map((node) => {
      const record = records[node.id];
      const state = getSkillState(node, completed);
      const xp = record ? Math.round((tierXp[Number(node.tier) || 1] || 25)
        * (record.status === 'evidenced' ? 1 : 0.5)
        * (confidenceMultipliers[record.confidence] || 0.85)) : 0;
      return {
        ...node, state, isCompleted: state === 'completed', isAvailable: state === 'available', isLocked: state === 'locked',
        progressStatus: record?.status || 'not_started', confidence: record?.confidence || null,
        confidenceLabel: confidenceLabels[record?.confidence] || null, evidence: record?.evidence || [], xp
      };
    });
    const milestoneProgress = milestones(tree, completed);
    const evidencedCount = Object.values(records).filter((record) => record.status === 'evidenced').length;
    const areas = Object.fromEntries((tree.areas || []).map((area) => {
      const areaNodes = tree.nodes.filter((node) => (node.area || 'core_engineering') === area.id);
      const areaCompleted = areaNodes.filter((node) => completed.has(node.id)).length;
      return [area.id, { ...area, total: areaNodes.length, completed: areaCompleted,
        evidenced: areaNodes.filter((node) => records[node.id]?.status === 'evidenced').length,
        percent: areaNodes.length ? Math.round(areaCompleted / areaNodes.length * 100) : 0 }];
    }));
    return {
      completedSkills: [...completed], completedCount: completed.size,
      selfAssessedCount: completed.size - evidencedCount, evidencedCount,
      totalXp: nodes.reduce((sum, node) => sum + node.xp, 0), careerLevel: careerLevel(milestoneProgress, evidencedCount),
      milestones: milestoneProgress, skillProgress: records, totalSkills: nodes.length,
      percentage: nodes.length ? Math.round(completed.size / nodes.length * 100) : 0,
      availableCount: nodes.filter((node) => node.state === 'available').length,
      lockedCount: nodes.filter((node) => node.state === 'locked').length, areas, nodes
    };
  }

  function badgeStatus(tree, completedIds) {
    const completed = new Set(completedIds);
    return (tree.badges || []).map((badge) => {
      const areaId = badgeAreaIds[badge.id];
      let current = 0;
      let target = 0;
      let description = badge.description;
      if (areaId) {
        const skills = tree.nodes.filter((node) => (node.area || 'core_engineering') === areaId);
        current = skills.filter((node) => completed.has(node.id)).length;
        target = skills.length;
        description = `Complete every skill in ${tree.areas.find((area) => area.id === areaId)?.name || badge.name}.`;
      } else {
        const relevant = (tree.milestones || []).filter((item) => badge.id === 'badge_junior_engineer' ? Number(item.tier) <= 2 : badge.id === 'badge_senior_engineer' && Number(item.tier) >= 4);
        current = relevant.filter((item) => (item.requires || []).length && item.requires.every((id) => completed.has(id))).length;
        target = relevant.length;
        description = relevant.length ? 'Complete all relevant capability milestones.' : description;
      }
      const earned = target > 0 && current >= target;
      return { ...badge, earned, status: earned ? 'earned' : 'locked', description,
        progress: { current, target, label: target ? `${current} / ${target}` : 'Requirements pending' } };
    });
  }

  const api = {
    load,
    save(tree, skillId, input) {
      const records = load(tree);
      const evidenceUrl = String(input.evidenceUrl || '').trim();
      if (evidenceUrl && (!isSafeUrl(evidenceUrl) || evidenceUrl.length > 2048)) throw new Error('Evidence must be a valid http or https URL');
      records[skillId] = {
        status: evidenceUrl ? 'evidenced' : 'self_assessed',
        confidence: Math.max(1, Math.min(4, Number(input.confidence) || 2)),
        evidence: evidenceUrl ? [{ url: evidenceUrl, label: String(input.evidenceLabel || 'Project evidence').slice(0, 120), createdAt: new Date().toISOString() }] : [],
        updatedAt: new Date().toISOString()
      };
      persist(records);
    },
    clear(tree, skillId) { const records = load(tree); delete records[skillId]; persist(records); },
    reset() { localStorage.removeItem(STORAGE_KEY); },
    build(tree) {
      const progress = snapshot(tree, load(tree));
      return { ...tree, nodes: progress.nodes, progress, badges: badgeStatus(tree, progress.completedSkills) };
    },
    export(tree) {
      const records = load(tree);
      return { format: FORMAT, version: 1, datasetVersion: tree.meta?.version || null, exportedAt: new Date().toISOString(),
        progress: { completedSkills: Object.keys(records), skillProgress: records } };
    },
    import(tree, payload) {
      if (!payload || payload.format !== FORMAT || payload.version !== 1 || !payload.progress) throw new Error('Unsupported or invalid progress export');
      const records = normalize(tree, payload.progress);
      if (!Object.keys(records).length && Object.keys(payload.progress.skillProgress || {}).length) throw new Error('Import does not contain recognised skill progress');
      persist(records);
    }
  };

  globalThis.SkillTreeProgress = api;
  if (typeof module !== 'undefined') module.exports = api;
}());
