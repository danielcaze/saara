# Saara Repo Hygiene Design

**Goal:** Prepare the repo for public release on GitHub — license, real package metadata, a real README, and stop tracking internal AI-workflow docs — then create the GitHub repo and push. This unblocks the CI/CD (build + GitHub Releases) work that follows, which needs a real remote to test against.

**Not in scope:** Logo/branding (separate design), CI/CD workflow (separate design), CONTRIBUTING.md / CODE_OF_CONDUCT.md / issue templates (explicitly decided against — hobby/single-maintainer project, this ceremony doesn't fit).

---

## Context

Saara is an Electron + TypeScript + React desktop app (Windows-first) for importing and organizing photos from an SD card by event, with a Google Drive upload destination alongside local-folder copy (see `docs/superpowers/specs/2026-08-14-saara-v2-roadmap-design.md` Checkpoint 1). The repo has never been pushed to GitHub (no `git remote`) and currently has:

- No `LICENSE` file
- `package.json` with placeholder `author: "Saara"`, generic `description`, no `license`/`repository`/`homepage`/`bugs` fields
- `README.md` that's still the unedited `electron-vite` scaffold boilerplate
- `docs/superpowers/` (specs and plans from the AI-assisted development process) committed to git — 6 files tracked as of this writing

A `fallow audit` + `fallow security` pass was run against current `master`: 0 dead code, 0 duplication, maintainability 90.5/100. Security scan flagged several medium-severity path-traversal/SSRF candidates (`copyEngine.ts`, `driveApi.ts`, `scanFiles.ts`, `driveAuthStore.ts`, `settingsStore.ts`) — all are `fetch`/`fs` calls with non-literal paths built from **locally user-supplied input** (SD card folder names, group names the user types, the user's own OAuth token endpoint), not remote/attacker-controlled input, in a single-user desktop app. Most already pass through `sanitizeFolderName.ts`. These are accepted as-is for this pass — not remediated here, just noted so a future external contributor reading the code isn't surprised these weren't "fixed" for the open-source release. No secrets or credentials found in tracked files (`.env` confirmed untracked and gitignored).

## Decisions

- **License:** MIT. Copyright holder "Daniel Cazé", year 2026.
- **Author identity:** `Daniel Cazé <danielcazedev@gmail.com>` — used in `package.json`'s `author` field and the LICENSE copyright line.
- **GitHub identity:** `github.com/danielcaze/saara`, created **public**.
- **`docs/superpowers/`:** stays on disk (specs/plans keep being written there for the AI-assisted workflow), but is removed from git tracking and added to `.gitignore`. It's internal working material, not project documentation for end users or contributors.
- **README:** rewritten with real content now (what the app does, features, setup incl. Google Drive OAuth setup, dev/build commands). No screenshot/logo yet — added in the branding pass once the logo exists.
- **No CONTRIBUTING/CODE_OF_CONDUCT/issue templates/SECURITY.md** — deliberately skipped as disproportionate ceremony for a single-maintainer hobby tool. `AGENTS.md` (already present) covers the "how this codebase works" context that would otherwise go in CONTRIBUTING.

## Components

### 1. `LICENSE` (new file)
Standard MIT license text, copyright line: `Copyright (c) 2026 Daniel Cazé`.

### 2. `package.json` (modified)
- `"description"`: real one-line description of what Saara does.
- `"author"`: `"Daniel Cazé <danielcazedev@gmail.com>"`
- `"license"`: `"MIT"`
- `"repository"`: `{ "type": "git", "url": "git+https://github.com/danielcaze/saara.git" }`
- `"homepage"`: `"https://github.com/danielcaze/saara#readme"`
- `"bugs"`: `{ "url": "https://github.com/danielcaze/saara/issues" }`

No version bump as part of this change — version stays at whatever it currently is; versioning strategy is a CI/CD-design concern.

### 3. `README.md` (rewritten)
Structure:
- Title + one-line description
- Features (bullet list: SD-card import, event-based grouping/clustering, local-folder or Google Drive destination, resumable/pausable Drive uploads, never-overwrite copy safety)
- Setup: `npm install`, then Google Drive OAuth setup (condensed version of the Prerequisite section already written in `docs/superpowers/plans/2026-08-14-saara-drive-destination-plan.md` — Cloud Console project, enable Drive API, OAuth consent screen + test users, Desktop OAuth client, `.env` from `.env.example`). Note that Drive is optional — local-folder destination works with zero setup.
- Development: `npm run dev`
- Build: existing `npm run build:win`/`:mac`/`:linux` block (keep, it's accurate)
- License: one line, links to `LICENSE`

### 4. `.gitignore` (modified)
Add `docs/superpowers/`. (`docs/` currently has no other subdirectory, but scoping the ignore to `docs/superpowers/` specifically — rather than all of `docs/` — keeps room for public-facing docs to live under `docs/` later without a `.gitignore` change.)

### 5. Untrack existing docs
`git rm --cached -r docs/superpowers/` — removes the 6 already-tracked files from git's index without touching them on disk.

### 6. Publish
- `gh repo create danielcaze/saara --public --source=. --remote=origin` (creates the GitHub repo and wires up the `origin` remote; does not push yet)
- Commit all the above changes
- `git push -u origin master`

## Testing / Verification

- `npm run build` still succeeds after `package.json` changes (sanity check nothing broke the build config).
- `git status` clean after commit; `docs/superpowers/` absent from `git ls-files` but still present on disk.
- Confirm `.env` still absent from `git ls-files` (regression check — should already be true, verify it stays true).
- After push: confirm the GitHub repo is reachable and shows the expected file tree (no `.env`, no `docs/superpowers/`, `LICENSE` present, README renders).
