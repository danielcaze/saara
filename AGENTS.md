# AGENTS.md

This file gives coding agents project-specific context. Keep it short and update it when workflows change.

## Project Overview

- Primary app or package: Saara — Electron + TypeScript + React desktop app (Windows) for importing/organizing photos from an SD card by event.
- Main entry points: `src/main/index.ts` (Electron main), `src/preload/index.ts` (preload/contextBridge), `src/renderer/src/main.tsx` (React renderer, declared via `src/renderer/index.html`).
- Important directories: `src/main/` (Node/Electron side — fs, exiftool, IPC handlers), `src/renderer/` (React UI), `src/shared/` (pure TS, zero Node/Electron deps — clustering algorithm, zod schemas, IPC types; imported by both main and renderer).

## Architecture Notes

- Module boundaries: `src/shared/` must never import Node or Electron APIs (enforced by convention, not tooling) — it's imported by both `src/main/` and `src/renderer/`. Renderer talks to main only through the `window.saaraAPI` surface exposed by `src/preload/index.ts`; every IPC handler in `src/main/ipc/handlers.ts` validates its payload with a zod schema from `src/shared/ipcSchemas.ts` before use.
- Generated or vendored code: none checked in; `out/` (electron-vite build output) and `release/` (electron-builder packaging output) are gitignored.
- Sensitive areas: `src/main/fs/copyEngine.ts` — file-copy safety (never overwrite, conflict-suffix naming) is the app's core promise; changes here need real concurrency scrutiny, not just passing tests (see git history: a TOCTOU race was found and fixed here during final review).

## Commands

- Install: `npm install`
- Build: `npm run build` (typecheck + electron-vite build), `npm run build:win` (+ electron-builder Windows installer)
- Dev: `npm run dev` (opens an Electron window — avoid running repeatedly in automated loops, it's a real GUI process)
- Test: `npm test` (vitest, fast/mocked-fs suite), `npm run test:metadata` (real exiftool + binary fixtures in `tests/fixtures/`, slower)
- Typecheck: `npm run typecheck` (`tsc --noEmit` for both `tsconfig.node.json` and `tsconfig.web.json` — `src/shared/` is checked under both)
- Lint: `npm run lint` (eslint), `npm run format` (prettier)
- Code smell / dead code / duplication: `npm run smell` (fallow, see below)

## Fallow

Installed as a devDependency (`npm run smell` runs dead-code + dupes + health --hotspots). Invoke ad hoc via `npx fallow <command>` (resolves the local install, no network hit). Config: `.fallowrc.json` — declares `src/renderer/src/main.tsx` as a manual entry point, since fallow's electron plugin doesn't know electron-vite's HTML-driven renderer entry convention; without it, the entire renderer tree false-positives as dead code.

- Use `npx fallow audit --format json --quiet` before committing AI-generated changes.
- Use `npx fallow dead-code --format json --quiet`, `npx fallow dupes --format json --quiet`, and `npx fallow health --format json --quiet` for targeted checks.
- Use `npx fallow list --entry-points --format json --quiet` and `npx fallow list --boundaries --format json --quiet` to inspect project shape.

<!-- generated:task-matrix:start -->
| When the agent is about to... | Run |
|---|---|
| delete an "unused" export or file | `fallow dead-code --trace <file>:<export>` |
| prove a TypeScript symbol's exact consumers before refactoring | `fallow dead-code --type-aware --symbol-impact <file>:<export-or-class.method>` |
| delete an "unused" dependency | `fallow dead-code --trace-dependency <name>` |
| commit or open a PR | `fallow audit --base <ref>` |
| prioritize refactoring | `fallow health --hotspots --targets` |
| ask who owns code | `fallow health --ownership` |
| check untested-but-reachable code | `fallow health --coverage-gaps` |
| consolidate duplication | `fallow dupes --trace dup:<fingerprint>` |
| find feature flags | `fallow flags` |
| check which architecture rules apply to a file before changing it | `fallow guard <files>` |
| surface security candidates | `fallow security` |
| understand a finding | `fallow explain <issue-type>` |
| scope a monorepo | `--workspace <glob> / --changed-workspaces <ref>` (global flags, prefix any command) |
<!-- generated:task-matrix:end -->

## Agent Rules

- Do not edit: `out/`, `release/`, `.git/` — build/packaging output, never source.
- Always ask before: `npm run dev` (opens a real Electron window) or `npm run build:win` (heavy build) if the user hasn't explicitly requested it in the current task.
- Preferred style: Portuguese for all UI-facing strings (labels, buttons, group names); English for code/comments/commit messages. No `Co-Authored-By` trailer on commits.
