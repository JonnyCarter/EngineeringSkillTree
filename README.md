# Software Engineer Skill Tree MVP

A static HTML, CSS, and JavaScript skill tree for software engineers. It can be hosted on GitHub Pages with no application server or database.

## Features

- Device-local progress stored in the browser with `localStorage`
- JSON export and import for moving progress between browsers or devices
- Skill graph with prerequisite-aware guidance and flexible completion states
- Responsive Cytoscape.js skill graph with Dagre layout
- Smooth mouse, trackpad, touch, and keyboard navigation
- Progressive focus mode that reveals the next skill layer as the learner advances
- Filters for engineering tree and skill level
- Skill detail panel with completion toggle and learning resources
- Confidence-based self-assessed skill progress
- Confidence, derived XP, capability milestones, and emergent career levels
- Skill-tree and career badges with live progress and automatic unlocking
- No backend, accounts, cookies, or external runtime dependencies

## Run locally

Serve the `public` directory with any static web server. The existing development command remains available:

1. Run `npm start` (no install step is required).
2. Open `http://localhost:3000`.

Stop it with `Ctrl+C`.

Opening `index.html` directly is not supported because browsers normally block local `fetch()` requests for the JSON dataset.

## Progress and transfers

Progress is saved only in the current browser under the `engineering-skill-tree-progress-v1` local-storage key. There is no user account and no server copy, so clearing browser site data clears progress.

Use **Export** to download a versioned JSON backup. On another device, open the site and use **Import** to replace that browser's progress with the backup.

## GitHub Pages

The deploy workflow in `.github/workflows/deploy-pages.yml` publishes the contents of `public` whenever `main` is updated. In the repository's **Settings > Pages**, choose **GitHub Actions** as the source. Relative asset paths make the app work both at a user site and under a repository path.

## GitHub skill suggestions

The optional GitHub inference script uses the authenticated `gh` CLI account to produce a reviewable JSON report. It reads repository metadata and authored or reviewed pull requests; it never changes application progress.

1. Install and authenticate GitHub CLI:
   `gh auth login`
2. Analyse the authenticated account:
   `npm run infer:github -- --output github-skill-report.json`
3. Analyse another account visible to the authenticated user:
   `npm run infer:github -- --login USERNAME --output github-skill-report.json`

The report contains suggested skill IDs, confidence, reasons, and supporting links. Treat suggestions as evidence candidates rather than automatic proof of competence, especially when repository names or pull-request titles are ambiguous.

## Project structure

- `public/index.html` — app shell
- `public/css/styles.css` — dark game-like UI styling
- `public/js/app.js` — graph rendering and UI integration
- `public/js/progress-store.js` — local progress, XP, badges, and import/export
- `public/data/skill-tree.json` — deployed skill tree dataset
- `scripts/serve-static.js` — dependency-free local development server

## Architecture decisions

### Persistence

Progress is intentionally device-local. The browser calculates progression and writes the normalized skill records to `localStorage`. Export/import is the portability and backup mechanism for this MVP.

### Prerequisites and unlocks

The browser derives skill availability from the dataset and locally stored progress. A skill is considered:

- Locked: some prerequisites are incomplete
- Available: prerequisites are complete and it can be explored
- Completed: the user has marked it complete

Locked skills can still be marked complete. Prerequisites guide the recommended path, while allowing experienced users to jump ahead and leave earlier skills visible as gaps to revisit.

### Graph rendering

Cytoscape.js owns graph rendering, selection, panning, and zooming. The Cytoscape Dagre extension computes a left-to-right directed layout from skill prerequisites. Both browser bundles are committed under `public/vendor` so the published site has no CDN dependency.

### Badge model

Specialisation badges track every skill in their corresponding engineering tree. Junior and Senior Engineer badges track the tier-based capability milestones in the dataset. Badge cards show current progress and unlock automatically. Explicit dataset rules can still override these defaults using `skill_all`, `skill_count`, `area_minimum`, or `milestone_required` requirements.

### Progression model

Each completed skill is stored as a self-assessment with a confidence level from Guided to Leadership. XP is derived from skill tier and confidence, so it cannot be farmed by repeatedly toggling completion. Capability milestones are calculated from their required skills, and career level progresses from Foundation through Junior, Engineer, Senior, and Staff based on milestone depth. Legacy checkbox completions and evidence-backed exports are read as self-assessments.

## Important notes

- The dataset remains the source of truth for skills, relationships, areas, and learning resources.
- The app intentionally keeps the implementation simple and readable for junior engineers.
- `public/data/skill-tree.json` is the deployed dataset and must be updated when the source tree changes.
