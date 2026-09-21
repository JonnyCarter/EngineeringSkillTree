const state = {
  tree: null,
  selectedSkillId: null,
  user: null,
  graph: null,
  viewMode: 'focus',
  treeFilter: 'all',
  levelFilter: 'all',
  completionPending: false
};

const elements = {
  progressSummary: document.getElementById('progress-summary'),
  badgeList: document.getElementById('badge-list'),
  detailPanel: document.getElementById('detail-panel'),
  treeGraph: document.getElementById('skill-tree'),
  treeViewport: document.getElementById('tree-viewport'),
  resetButton: document.getElementById('reset-progress'),
  exportButton: document.getElementById('export-progress'),
  importButton: document.getElementById('import-progress'),
  importFile: document.getElementById('import-progress-file'),
  zoomIn: document.getElementById('zoom-in'),
  zoomOut: document.getElementById('zoom-out'),
  zoomReset: document.getElementById('zoom-reset'),
  viewMode: document.getElementById('view-mode'),
  treeFilter: document.getElementById('tree-filter'),
  levelFilter: document.getElementById('level-filter')
};

function toTitleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderProgress(progress) {
  if (!progress) {
    elements.progressSummary.innerHTML = '<p class="empty-detail">No progress yet.</p>';
    return;
  }

  const percent = progress.percentage || 0;
  const milestones = progress.milestones || [];
  const earnedMilestones = milestones.filter((milestone) => milestone.earned).length;
  const nextMilestones = milestones
    .filter((milestone) => !milestone.earned)
    .sort((a, b) => (b.completed / Math.max(1, b.target)) - (a.completed / Math.max(1, a.target)))
    .slice(0, 3);
  const milestoneMarkup = nextMilestones.map((milestone) => `
    <li>
      <span>${escapeHtml(milestone.name)}</span>
      <strong>${milestone.completed} / ${milestone.target}</strong>
    </li>
  `).join('');
  const areaMarkup = Object.values(progress.areas || {}).map((area) => `
    <div class="metric">
      <span>${escapeHtml(area.name)}</span>
      <strong>${area.completed} / ${area.total}</strong>
      <small>${area.evidenced || 0} evidenced</small>
      <div class="progress-bar" aria-label="${escapeHtml(area.name)} progress">
        <span class="progress-fill" style="width: ${Math.min(area.percent, 100)}%"></span>
      </div>
    </div>
  `).join('');

  elements.progressSummary.innerHTML = `
    <div class="progress-highlights">
      <div class="metric compact-metric">
        <span>Career level</span>
        <strong>${escapeHtml(progress.careerLevel?.name || 'Foundation')}</strong>
      </div>
      <div class="metric compact-metric">
        <span>Experience</span>
        <strong>${progress.totalXp || 0} XP</strong>
      </div>
    </div>
    <div class="metric">
      <span>Overall progress</span>
      <strong>${progress.completedCount} / ${progress.totalSkills}</strong>
      <small>${progress.selfAssessedCount || 0} self-assessed · ${progress.evidencedCount || 0} evidenced</small>
      <div class="progress-bar" aria-label="Overall progress">
        <span class="progress-fill" style="width: ${percent}%"></span>
      </div>
    </div>
    <div class="metric">
      <span>Capability milestones</span>
      <strong>${earnedMilestones} / ${milestones.length}</strong>
      ${milestoneMarkup ? `<ul class="milestone-preview">${milestoneMarkup}</ul>` : '<small>All milestones earned</small>'}
    </div>
    ${areaMarkup}
  `;
}

function renderBadges(badges) {
  if (!Array.isArray(badges) || !badges.length) {
    elements.badgeList.innerHTML = '<li class="empty-detail">No badges available yet.</li>';
    return;
  }

  elements.badgeList.innerHTML = badges.map((badge) => {
    const earnedClass = badge.earned ? 'earned' : 'locked';
    const badgeText = badge.earned ? 'Earned' : 'Locked';
    const description = badge.description || 'Placeholder badge requirement pending';
    const current = Number(badge.progress?.current || 0);
    const target = Number(badge.progress?.target || 0);
    const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

    return `
      <li class="badge-item ${earnedClass}">
        <div class="badge-topline">
          <span class="badge-name">${escapeHtml(badge.name)}</span>
          <span class="badge-pill">${badgeText}</span>
        </div>
        <p>${escapeHtml(description)}</p>
        <div class="badge-progress" role="progressbar" aria-label="${escapeHtml(badge.name)} progress" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${current}">
          <span style="width: ${percent}%"></span>
        </div>
        <p class="badge-progress-label">${escapeHtml(badge.progress?.label || 'Progress pending')}</p>
      </li>
    `;
  }).join('');
}

function getAreaColor(areaId) {
  const palette = {
    core_engineering: '#38bdf8',
    backend_engineering: '#a78bfa',
    frontend_engineering: '#f472b6',
    platform_sre: '#fbbf24',
    security_engineering: '#fb7185',
    software_architecture: '#34d399',
    cloud_engineering: '#3b82f6',
    ai_engineering: '#8b5cf6',
    communication_collaboration: '#ec4899',
    delivery_ways_of_working: '#14b8a6',
    product_engineering: '#f97316',
    technical_leadership: '#6366f1'
  };

  return palette[areaId] || '#38bdf8';
}

function renderGraphFilters(tree) {
  const selectedTree = state.treeFilter;
  const selectedLevel = state.levelFilter;
  const treeOptions = [{ id: 'all', name: 'All trees' }, ...(tree.areas || [])];
  const levels = [...new Set((tree.nodes || []).map((node) => node.tier || 1))].sort((a, b) => a - b);

  elements.treeFilter.replaceChildren(...treeOptions.map((area) => {
    const option = document.createElement('option');
    option.value = area.id;
    option.textContent = area.name;
    return option;
  }));
  elements.levelFilter.replaceChildren(...[
    { value: 'all', label: 'All levels' },
    ...levels.map((level) => ({ value: String(level), label: `Level ${level}` }))
  ].map(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }));

  state.treeFilter = treeOptions.some((area) => area.id === selectedTree) ? selectedTree : 'all';
  state.levelFilter = levels.some((level) => String(level) === selectedLevel) ? selectedLevel : 'all';
  elements.treeFilter.value = state.treeFilter;
  elements.levelFilter.value = state.levelFilter;
}

function getFilteredNodes(tree) {
  return (tree.nodes || []).filter((node) => {
    const matchesTree = state.treeFilter === 'all'
      || (node.area || 'core_engineering') === state.treeFilter;
    const matchesLevel = state.levelFilter === 'all'
      || String(node.tier || 1) === state.levelFilter;
    return matchesTree && matchesLevel;
  });
}

function getVisibleNodes(tree) {
  const nodes = getFilteredNodes(tree);
  if (state.viewMode === 'all' || state.treeFilter !== 'all' || state.levelFilter !== 'all') {
    return nodes;
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const visibleIds = new Set(
    nodes.filter((node) => node.state === 'available').map((node) => node.id)
  );

  if (state.selectedSkillId) {
    visibleIds.add(state.selectedSkillId);
  }

  const frontierIds = [...visibleIds];
  const addPrerequisites = (nodeId) => {
    const node = nodesById.get(nodeId);
    for (const prerequisiteId of node?.prerequisites || []) {
      if (!visibleIds.has(prerequisiteId)) {
        visibleIds.add(prerequisiteId);
        addPrerequisites(prerequisiteId);
      }
    }
  };

  for (const nodeId of [...visibleIds]) {
    addPrerequisites(nodeId);
  }

  for (const node of nodes) {
    if ((node.prerequisites || []).some((id) => frontierIds.includes(id))) {
      visibleIds.add(node.id);
    }
  }

  return nodes.filter((node) => visibleIds.has(node.id));
}

function buildGraphElements(tree) {
  const nodes = getVisibleNodes(tree);
  const visibleIds = new Set(nodes.map((node) => node.id));
  const nodeElements = nodes.map((node) => ({
    data: {
      id: node.id,
      label: `T${node.tier || 1}  ${node.name}`,
      state: node.state || 'locked',
      progressStatus: node.progressStatus || 'not_started',
      areaColor: getAreaColor(node.area || 'core_engineering')
    },
    classes: `${node.state || 'locked'} ${node.progressStatus || 'not_started'}`
  }));
  const edgeElements = nodes.flatMap((node) => (node.prerequisites || [])
    .filter((prerequisiteId) => visibleIds.has(prerequisiteId))
    .map((prerequisiteId) => ({
    data: {
      id: `${prerequisiteId}--${node.id}`,
      source: prerequisiteId,
      target: node.id
    }
    })));

  return [...nodeElements, ...edgeElements];
}

function graphStyles() {
  return [
    {
      selector: 'node',
      style: {
        width: 176,
        height: 62,
        shape: 'round-rectangle',
        label: 'data(label)',
        color: '#292820',
        'font-family': 'Courier New, monospace',
        'font-size': 11,
        'font-weight': 700,
        'text-wrap': 'wrap',
        'text-max-width': 148,
        'text-valign': 'center',
        'text-halign': 'center',
        'background-color': 'data(areaColor)',
        'background-opacity': 0.38,
        'border-color': '#3d3b32',
        'border-width': 3,
        'overlay-opacity': 0
      }
    },
    {
      selector: 'node.available',
      style: {
        'background-color': '#9be1b5',
        'background-opacity': 1,
        'border-color': '#28794f',
        'shadow-blur': 14,
        'shadow-color': '#2f9e68',
        'shadow-opacity': 0.35
      }
    },
    {
      selector: 'node.completed',
      style: {
        'background-color': '#ffe08a',
        'background-opacity': 1,
        'border-color': '#a56d18'
      }
    },
    {
      selector: 'node.evidenced',
      style: {
        'border-color': '#236b9a',
        'border-width': 5,
        'shadow-blur': 12,
        'shadow-color': '#4cb7d7',
        'shadow-opacity': 0.4
      }
    },
    {
      selector: 'node.locked',
      style: {
        'background-color': '#d4cfbb',
        'background-opacity': 0.78,
        color: '#716d5f'
      }
    },
    {
      selector: 'edge',
      style: {
        width: 3,
        'curve-style': 'taxi',
        'taxi-direction': 'rightward',
        'taxi-turn': 24,
        'line-color': '#716d5f',
        'line-opacity': 0.42,
        'target-arrow-color': '#716d5f',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.85
      }
    },
    {
      selector: '.branch',
      style: {
        'border-color': '#e5a52f',
        'line-color': '#e5a52f',
        'target-arrow-color': '#e5a52f',
        'line-opacity': 0.95,
        'z-index': 10
      }
    },
    {
      selector: 'edge.branch',
      style: { width: 5 }
    },
    {
      selector: 'node.selected-skill',
      style: {
        'border-width': 5,
        'border-color': '#d85b4d',
        'shadow-blur': 18,
        'shadow-color': '#e5a52f',
        'shadow-opacity': 0.7,
        'z-index': 20
      }
    },
    {
      selector: 'node.hovered',
      style: {
        'border-width': 5,
        'overlay-color': '#fffdf3',
        'overlay-opacity': 0.2,
        'overlay-padding': 6
      }
    },
    {
      selector: '.deemphasized',
      style: { opacity: 0.22 }
    }
  ];
}

function updateGraphSelection() {
  if (!state.graph || !state.selectedSkillId) {
    return;
  }

  const selected = state.graph.$id(state.selectedSkillId);
  if (!selected.length) {
    return;
  }

  const lineage = selected
    .union(selected.predecessors())
    .union(selected.successors());
  const parents = selected.incomers('node');
  const siblings = parents.length
    ? parents.outgoers('node')
    : state.graph.nodes().filter((node) => node.indegree() === 0);
  const branchNodes = lineage.nodes().union(siblings);
  const branch = branchNodes.union(branchNodes.edgesWith(branchNodes));

  state.graph.elements().removeClass('branch deemphasized selected-skill');
  state.graph.elements().difference(branch).addClass('deemphasized');
  branch.addClass('branch');
  selected.addClass('selected-skill');
}

function getKeyboardDestination(direction) {
  if (!state.graph) {
    return null;
  }

  let selected = state.selectedSkillId ? state.graph.$id(state.selectedSkillId) : state.graph.collection();
  if (!selected.length) {
    selected = state.graph.nodes().filter((node) => node.data('state') === 'available').first();
  }
  if (!selected.length) {
    return null;
  }

  const origin = selected.position();
  let candidates;

  if (direction === 'right') {
    candidates = selected.outgoers('node');
  } else if (direction === 'left') {
    candidates = selected.incomers('node');
  } else {
    const verticalDirection = direction === 'up' ? -1 : 1;
    const sameLevel = state.graph.nodes().filter((node) => {
      if (node.id() === selected.id()) {
        return false;
      }
      const position = node.position();
      return Math.abs(position.x - origin.x) < 80
        && Math.sign(position.y - origin.y) === verticalDirection;
    });

    candidates = sameLevel.length
      ? sameLevel
      : state.graph.nodes().filter((node) => {
        const deltaY = node.position().y - origin.y;
        return node.id() !== selected.id() && Math.sign(deltaY) === verticalDirection;
      });
  }

  return [...candidates].sort((a, b) => {
    const aPosition = a.position();
    const bPosition = b.position();
    const aScore = Math.abs(aPosition.y - origin.y) + Math.abs(aPosition.x - origin.x) * 2;
    const bScore = Math.abs(bPosition.y - origin.y) + Math.abs(bPosition.x - origin.x) * 2;
    return aScore - bScore;
  })[0] || null;
}

function navigateGraphByKeyboard(direction) {
  const destination = getKeyboardDestination(direction);
  if (!destination) {
    return;
  }

  showSkillDetails(destination.id());
  state.graph.animate({
    center: { eles: destination },
    duration: 220,
    easing: 'ease-out-cubic'
  });
}

function captureGraphViewport() {
  if (!state.graph) {
    return null;
  }

  const selected = state.selectedSkillId ? state.graph.$id(state.selectedSkillId) : null;
  return {
    zoom: state.graph.zoom(),
    pan: state.graph.pan(),
    selectedRenderedPosition: selected?.length ? selected.renderedPosition() : null
  };
}

function restoreGraphViewport(viewport) {
  if (!viewport || !state.graph) {
    return;
  }

  state.graph.zoom(viewport.zoom);
  const selected = state.selectedSkillId ? state.graph.$id(state.selectedSkillId) : null;
  if (!selected?.length || !viewport.selectedRenderedPosition) {
    state.graph.pan(viewport.pan);
    return;
  }

  const position = selected.position();
  state.graph.pan({
    x: viewport.selectedRenderedPosition.x - position.x * viewport.zoom,
    y: viewport.selectedRenderedPosition.y - position.y * viewport.zoom
  });
}

function renderTree(tree) {
  if (typeof window.cytoscape !== 'function') {
    elements.treeGraph.textContent = 'Graph library failed to load.';
    return;
  }

  const previousViewport = captureGraphViewport();
  if (state.graph) {
    const previousGraph = state.graph;
    state.graph = null;
    previousGraph.destroy();
  }

  state.graph = window.cytoscape({
    container: elements.treeGraph,
    elements: buildGraphElements(tree),
    style: graphStyles(),
    layout: {
      name: 'dagre',
      rankDir: 'LR',
      rankSep: 150,
      nodeSep: 42,
      edgeSep: 18,
      ranker: 'network-simplex',
      fit: true,
      padding: 70
    },
    minZoom: 0.1,
    maxZoom: 2.2,
    wheelSensitivity: 0.18,
    boxSelectionEnabled: false,
    autoungrabify: true
  });
  restoreGraphViewport(previousViewport);

  state.graph.on('tap', 'node', (event) => {
    elements.treeGraph.focus({ preventScroll: true });
    showSkillDetails(event.target.id());
  });
  state.graph.on('mouseover', 'node', (event) => event.target.addClass('hovered'));
  state.graph.on('mouseout', 'node', (event) => event.target.removeClass('hovered'));
  state.graph.on('viewport', () => {
    elements.zoomReset.textContent = `${Math.round(state.graph.zoom() * 100)}%`;
  });
  window.requestAnimationFrame(() => {
    updateGraphSelection();
    elements.zoomReset.textContent = `${Math.round(state.graph.zoom() * 100)}%`;
  });
}

function renderDetailPanel(skill) {
  if (!skill) {
    elements.detailPanel.innerHTML = '<p class="empty-detail">Select a skill to inspect it.</p>';
    return;
  }

  const prerequisites = (skill.prerequisites || []).map((id) => {
    const prereqSkill = state.tree.nodes.find((node) => node.id === id);
    return prereqSkill ? `<li>${escapeHtml(prereqSkill.name)}</li>` : `<li>${escapeHtml(id)}</li>`;
  }).join('');

  const unlocks = (skill.unlocks || []).map((id) => {
    const unlockSkill = state.tree.nodes.find((node) => node.id === id);
    return unlockSkill ? `<li>${escapeHtml(unlockSkill.name)}</li>` : `<li>${escapeHtml(id)}</li>`;
  }).join('');

  const resources = (skill.learning_resources || []).map((resourceId) => {
    const resource = state.tree.resources.find((entry) => entry.id === resourceId);
    if (!resource) {
      return '';
    }
    return `
      <li class="resource-item">
        <strong>${escapeHtml(resource.title)}</strong>
        <div>${escapeHtml(resource.type || 'resource')} · ${escapeHtml(resource.provider || 'Unknown provider')}</div>
        ${resource.url ? `<a class="resource-link" href="${escapeHtml(resource.url)}" target="_blank" rel="noreferrer noopener">Open resource</a>` : '<span>Resource link pending</span>'}
      </li>
    `;
  }).join('');

  const completed = skill.state === 'completed';
  const evidence = skill.evidence?.[0] || {};
  const confidence = skill.confidence || 2;
  const progressStatus = skill.progressStatus === 'evidenced'
    ? 'evidenced'
    : completed ? 'self assessed' : skill.state || 'locked';

  elements.detailPanel.innerHTML = `
    <div class="skill-detail-header">
      <h3>${escapeHtml(skill.name)}</h3>
      <span class="state-chip ${skill.progressStatus || skill.state || 'locked'}">${escapeHtml(progressStatus)}</span>
    </div>

    <p>${escapeHtml(skill.description || 'No description available yet.')}</p>

    <div class="skill-meta">
      <div class="meta-item">
        <span class="label">Category</span>
        <strong>${escapeHtml(toTitleCase(skill.category || 'Uncategorised'))}</strong>
      </div>
      <div class="meta-item">
        <span class="label">Area</span>
        <strong>${escapeHtml(toTitleCase((skill.area || 'core_engineering').replace(/_/g, ' ')))}</strong>
      </div>
      <div class="meta-item">
        <span class="label">Tier</span>
        <strong>${escapeHtml(skill.tier || 1)}</strong>
      </div>
      <div class="meta-item">
        <span class="label">ID</span>
        <strong>${escapeHtml(skill.id)}</strong>
      </div>
    </div>

    <form class="assessment-form" data-assessment-form>
      <label>
        <span>Confidence</span>
        <select name="confidence">
          <option value="1" ${confidence === 1 ? 'selected' : ''}>Guided</option>
          <option value="2" ${confidence === 2 ? 'selected' : ''}>Independent</option>
          <option value="3" ${confidence === 3 ? 'selected' : ''}>Ownership</option>
          <option value="4" ${confidence === 4 ? 'selected' : ''}>Leadership</option>
        </select>
      </label>
      <label>
        <span>Evidence link <small>optional</small></span>
        <input name="evidenceUrl" type="url" placeholder="GitHub or Confluence URL" value="${escapeHtml(evidence.url || '')}" />
      </label>
      <label>
        <span>Evidence label <small>optional</small></span>
        <input name="evidenceLabel" maxlength="120" placeholder="What this demonstrates" value="${escapeHtml(evidence.label || '')}" />
      </label>
      ${evidence.url ? `<a class="resource-link saved-evidence" href="${escapeHtml(evidence.url)}" target="_blank" rel="noreferrer noopener">Open saved evidence</a>` : ''}
      <div class="assessment-actions">
        <button type="submit" class="primary-button">Save progress</button>
        ${completed ? '<button type="button" class="secondary-button" data-clear-progress>Clear</button>' : ''}
      </div>
    </form>

    <section class="detail-section">
      <h4>Prerequisites</h4>
      ${prerequisites ? `<ul>${prerequisites}</ul>` : '<p>None</p>'}
    </section>

    <section class="detail-section">
      <h4>Unlocks</h4>
      ${unlocks ? `<ul>${unlocks}</ul>` : '<p>Nothing yet</p>'}
    </section>

    <section class="detail-section">
      <h4>Evidence ideas</h4>
      <ul>${(skill.evidence_examples || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </section>

    <section class="detail-section">
      <h4>Learning resources</h4>
      ${resources ? `<ul class="resource-list">${resources}</ul>` : '<p>No learning resources listed.</p>'}
    </section>
  `;

  const assessmentForm = elements.detailPanel.querySelector('[data-assessment-form]');
  if (assessmentForm) {
    assessmentForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(assessmentForm);
      saveSkillProgress(skill, {
        confidence: Number(formData.get('confidence')),
        evidenceUrl: formData.get('evidenceUrl'),
        evidenceLabel: formData.get('evidenceLabel')
      });
    });
    assessmentForm.querySelector('[data-clear-progress]')?.addEventListener('click', () => clearSkillProgress(skill));
  }
}

async function saveSkillProgress(skill, payload = {}) {
  if (!skill || state.completionPending) {
    return;
  }

  state.completionPending = true;
  try {
    window.SkillTreeProgress.save(state.tree, skill.id, payload);
    await loadApp();
  } catch (error) {
    elements.detailPanel.innerHTML = `<p class="empty-detail">${escapeHtml(error.message)}</p>`;
  } finally {
    state.completionPending = false;
  }
}

async function clearSkillProgress(skill) {
  if (!skill || state.completionPending) {
    return;
  }

  state.completionPending = true;
  try {
    window.SkillTreeProgress.clear(state.tree, skill.id);
    await loadApp();
  } catch (error) {
    elements.detailPanel.innerHTML = `<p class="empty-detail">${escapeHtml(error.message)}</p>`;
  } finally {
    state.completionPending = false;
  }
}

function toggleSkillCompletion(skill) {
  if (skill?.state === 'completed') {
    clearSkillProgress(skill);
  } else {
    saveSkillProgress(skill, { confidence: 2 });
  }
}

function showSkillDetails(skillId) {
  const foundSkill = state.tree.nodes.find((node) => node.id === skillId);
  state.selectedSkillId = skillId;
  renderDetailPanel(foundSkill);
  updateGraphSelection();
}

async function loadApp() {
  try {
    const dataset = state.rawTree || await fetch('./data/skill-tree.json').then((response) => {
      if (!response.ok) throw new Error('Could not load the skill tree dataset');
      return response.json();
    });
    state.rawTree = dataset;
    const treeResponse = window.SkillTreeProgress.build(dataset);

    state.tree = treeResponse;
    state.user = treeResponse.progress || {};

    renderProgress(treeResponse.progress || {});
    renderBadges(treeResponse.badges || []);
    renderGraphFilters(treeResponse);
    renderTree(treeResponse);

    if (state.selectedSkillId) {
      showSkillDetails(state.selectedSkillId);
      return;
    }

    const firstAvailable = (treeResponse.nodes || []).find((node) => node.state === 'available');
    if (firstAvailable) {
      showSkillDetails(firstAvailable.id);
    } else {
      renderDetailPanel((treeResponse.nodes || [])[0] || null);
    }
  } catch (error) {
    elements.detailPanel.innerHTML = `<p class="empty-detail">${escapeHtml(error.message)}</p>`;
  }
}

async function resetProgress() {
  try {
    if (!window.confirm('Clear all progress stored in this browser?')) return;
    window.SkillTreeProgress.reset();
    await loadApp();
  } catch (error) {
    elements.detailPanel.innerHTML = `<p class="empty-detail">${escapeHtml(error.message)}</p>`;
  }
}

async function exportProgress() {
  try {
    const payload = window.SkillTreeProgress.export(state.rawTree);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const filename = `skilltree-progress-${payload.exportedAt.slice(0, 10)}.json`;
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
  } catch (error) {
    elements.detailPanel.innerHTML = `<p class="empty-detail">${escapeHtml(error.message)}</p>`;
  }
}

async function importProgress(file) {
  if (!file) {
    return;
  }

  try {
    const payload = JSON.parse(await file.text());
    if (!window.confirm('Replace progress on this device with the selected export?')) {
      return;
    }
    window.SkillTreeProgress.import(state.rawTree, payload);
    state.selectedSkillId = null;
    await loadApp();
  } catch (error) {
    elements.detailPanel.innerHTML = `<p class="empty-detail">Import failed: ${escapeHtml(error.message)}</p>`;
  } finally {
    elements.importFile.value = '';
  }
}

function applyGraphFilters() {
  state.treeFilter = elements.treeFilter.value;
  state.levelFilter = elements.levelFilter.value;

  const filteredNodes = getFilteredNodes(state.tree);
  if (!filteredNodes.some((node) => node.id === state.selectedSkillId)) {
    const nextSelection = filteredNodes.find((node) => node.state === 'available') || filteredNodes[0] || null;
    state.selectedSkillId = nextSelection?.id || null;
  }

  renderTree(state.tree);
  const selectedSkill = state.tree.nodes.find((node) => node.id === state.selectedSkillId) || null;
  renderDetailPanel(selectedSkill);
}

function adjustZoom(nextZoom) {
  if (!state.graph) {
    return;
  }

  const zoom = Math.max(state.graph.minZoom(), Math.min(state.graph.maxZoom(), nextZoom));
  state.graph.animate({
    zoom: { level: zoom, position: { x: state.graph.width() / 2, y: state.graph.height() / 2 } },
    duration: 160,
    easing: 'ease-out-cubic'
  });
}

elements.zoomIn.addEventListener('click', () => adjustZoom((state.graph?.zoom() || 1) + 0.12));
elements.zoomOut.addEventListener('click', () => adjustZoom((state.graph?.zoom() || 1) - 0.12));
elements.zoomReset.addEventListener('click', () => {
  if (state.graph) {
    state.graph.animate({ fit: { eles: state.graph.elements(), padding: 70 }, duration: 360, easing: 'ease-out-cubic' });
  }
});
elements.viewMode.addEventListener('click', () => {
  state.viewMode = state.viewMode === 'focus' ? 'all' : 'focus';
  elements.viewMode.textContent = state.viewMode === 'focus' ? 'Full map' : 'Focus';
  elements.viewMode.setAttribute('aria-pressed', String(state.viewMode === 'all'));
  renderTree(state.tree);
});
elements.treeFilter.addEventListener('change', applyGraphFilters);
elements.levelFilter.addEventListener('change', applyGraphFilters);
elements.treeGraph.addEventListener('keydown', (event) => {
  if ((event.key === ' ' || event.key === 'Spacebar') && !event.repeat) {
    event.preventDefault();
    const selectedSkill = state.tree?.nodes.find((node) => node.id === state.selectedSkillId);
    toggleSkillCompletion(selectedSkill);
    return;
  }

  const directions = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down'
  };
  const direction = directions[event.key];
  if (!direction) {
    return;
  }

  event.preventDefault();
  navigateGraphByKeyboard(direction);
});

elements.exportButton.addEventListener('click', exportProgress);
elements.importButton.addEventListener('click', () => elements.importFile.click());
elements.importFile.addEventListener('change', () => importProgress(elements.importFile.files[0]));
elements.resetButton.addEventListener('click', resetProgress);
loadApp();
