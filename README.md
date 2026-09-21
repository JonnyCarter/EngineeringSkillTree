# Software Engineer Skill Tree MVP

A lightweight Node.js + Express prototype for an interactive game-like skill tree for software engineers.

## Features

- Anonymous cookie-based user identity
- File-backed persistence for users and progress
- Skill graph with prerequisite-aware guidance and flexible completion states
- Responsive Cytoscape.js skill graph with Dagre layout
- Smooth mouse, trackpad, touch, and keyboard navigation
- Progressive focus mode that reveals the next skill layer as the learner advances
- Filters for engineering tree and skill level
- Skill detail panel with completion toggle and learning resources
- Dual-track self-assessed and evidence-backed skill progress
- Confidence, derived XP, capability milestones, and emergent career levels
- Skill-tree and career badges with live progress and automatic unlocking
- REST endpoints for tree data and progress

## Local setup

1. Install dependencies:
   npm install
2. Start the app:
   npm start
3. Open in the browser:
   http://localhost:3000

Stop a server started with `npm start`:

    npm stop

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

- `server/server.js` — Express app and REST endpoints
- `server/storage.js` — user creation, cookie handling, dataset loading, file-backed storage
- `public/index.html` — app shell
- `public/css/styles.css` — dark game-like UI styling
- `public/js/app.js` — client rendering and API integration
- `data/skill-tree.json` — working copy of the supplied skill tree dataset
- `data/users.json` — anonymous user store
- `data/progress.json` — per-user progress state
- `software_engineer_skill_tree_v0_7.json` — active source dataset provided by the product brief

## Architecture decisions

### Anonymous users

On first visit, the server creates a UUID and stores it in an HttpOnly cookie named `skilltree_user_id`. The cookie uses `SameSite=Lax`, and `Secure` is enabled in production. The raw user ID is never exposed to the browser beyond the cookie.

### Persistence

The persistence layer is intentionally simple and file-backed so it can be replaced later with SQLite or PostgreSQL without reworking the application logic. Storage is centralized behind the `server/storage.js` module.

### Prerequisites and unlocks

The server is the source of truth for skill availability. A skill is considered:

- Locked: some prerequisites are incomplete
- Available: prerequisites are complete and it can be explored
- Completed: the user has marked it complete

Locked skills can still be marked complete. Prerequisites guide the recommended path, while allowing experienced users to jump ahead and leave earlier skills visible as gaps to revisit. The server remains the source of truth for progress state.

### Graph rendering

Cytoscape.js owns graph rendering, selection, panning, and zooming. The Cytoscape Dagre extension computes a left-to-right directed layout from skill prerequisites, reducing edge crossings without maintaining custom node-positioning code. Both browser bundles are installed through npm and served locally by Express under `/vendor`.

### Badge model

Specialisation badges track every skill in their corresponding engineering tree. Junior and Senior Engineer badges track the tier-based capability milestones in the dataset. Badge cards show current progress and unlock automatically. Explicit dataset rules can still override these defaults using `skill_all`, `skill_count`, `area_minimum`, or `milestone_required` requirements.

### Progression model

Each completed skill is stored as either `self_assessed` or `evidenced`, with a confidence level from Guided to Leadership. Evidence is an optional web link such as a GitHub project or Confluence page. XP is derived from skill tier, confidence, and evidence status, so it cannot be farmed by repeatedly toggling completion. Capability milestones are calculated from their required skills, and career level progresses from Foundation through Junior, Engineer, Senior, and Staff based on milestone depth and evidenced work. Legacy checkbox completions are read as Independent self-assessments.

## API summary

- `GET /api/me` — current anonymous user and progress snapshot
- `GET /api/tree` — full skill graph plus badge metadata
- `GET /api/progress` — user progress summary
- `POST /api/skills/:id/complete` — mark any valid skill complete
- `DELETE /api/skills/:id/complete` — mark a skill as not completed
- `GET /api/badges` — badge status for the current user

## Important notes

- The dataset remains the source of truth for skills, relationships, areas, and learning resources.
- The app intentionally keeps the implementation simple and readable for junior engineers.
- The design is extensible enough to swap in a database-backed store or richer badge rules later.
# EngineeringSkillTree
