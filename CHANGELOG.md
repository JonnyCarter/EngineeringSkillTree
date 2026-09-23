# Changelog

All notable changes to the Engineering Skill Tree MVP are recorded here.

## Unreleased

### Changed

- Simplified skill completion to confidence-based self-assessment.
- Removed evidence link and evidence label fields from the skill detail panel.
- Older evidence-backed exports remain importable and are converted to self-assessments.
- Career progression now derives from capability milestones without evidence-count requirements.

## 0.7 - 2026-09-21

### Added

- Complete v0.7 engineering skill tree with tree and level filters.
- XP, confidence levels, capability milestones, career levels, and automatic badges.
- Keyboard graph navigation and Space key completion toggle.
- Browser-local JSON progress export and import.
- Optional GitHub CLI skill suggestion report.
- GitHub Pages deployment workflow.

### Changed

- Converted the application to static HTML, CSS, and JavaScript using `localStorage`.
- Reworked the interface into a two-panel layout with the selected skill on the left and graph on the right.
- Added progressive focus mode while preserving graph pan and zoom between actions.
- Moved progress and badges into collapsible footer sections.
- Bundled the dataset and graph dependencies for self-contained static hosting.

### Removed

- Express backend, anonymous cookies, and file-backed user progress.
- Minimap and prerequisite completion restrictions.
- Superseded skill-tree datasets and server-era tooling.
