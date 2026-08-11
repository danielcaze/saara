# Saara V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desktop Windows app (Electron + TypeScript + React), named **Saara**, that imports photos/RAW/video from an SD card, auto-groups them into events by time-gap clustering, shows an editable preview in Portuguese, then copies (never moves) files into per-group destination folders.

**Architecture:** Electron main process owns all filesystem/exiftool/clustering/copy work; React renderer is pure UI talking to main only via a narrow typed IPC contract (`contextIsolation: true`, no direct Node access from renderer, all IPC payloads validated with `zod` at the main-process boundary). Clustering and name-suggestion logic live in `src/shared/` as pure, dependency-free functions so they're trivially unit-testable and reusable. UI is a single centered column (no sidebar), dark "contact-sheet" theme with a dark-red accent, Phosphor icons, and `motion` (successor to framer-motion) for sub-state transitions.

**Tech Stack:** Electron, TypeScript (strict), React, `electron-vite` (scaffold/build), `exiftool-vendored` (metadata), `zod` (IPC/input validation), `@phosphor-icons/react` (icons), `motion` (animation), `electron-builder` (Windows packaging), `vitest` (tests).

---

## Context

User transfers photos from a camera SD card to a PC and loses all organization — only a timestamp survives (sometimes not even that), with no notion of event/trip boundaries. Market research (2026-08-11, captured in the spec doc) confirmed no existing Windows tool does "group by event via configurable time gap" — the one tool that does this (Rapid Photo Downloader) is Linux-only and has officially refused to port. This app closes that gap for personal use, and doubles as a project to exercise Electron/TS/React skills.

Repo (`C:\www\personal\photo-sorter`) is currently empty except the spec at `docs/superpowers/specs/2026-08-11-photo-sorter-design.md` and prior planning docs — greenfield build, nothing to reuse. This plan **supersedes** the earlier draft plan written during plan mode: after the first draft, a second brainstorming round (senior-dev structural review + UI design) added an app rename, a 2-screen UI restructure, and a full visual-design direction. Everything below reflects the current spec.

**Decisions locked in (override the spec's literal suggestions or earlier drafts where noted):**
- **App name: Saara.** Product name, `package.json` name, window title, IPC global (`window.saaraAPI`) all use this.
- **Default clustering threshold: 24 hours** (daily grouping), not the spec's suggested 4h — without V1.1's AI-assisted naming, a 4h gap fragments a single day into too many groups. Still user-configurable per-import via the UI.
- **Gap boundary:** gap must be **strictly greater than** the threshold to start a new group (gap == threshold stays in the same group) — matches the spec's literal wording ("excede um threshold").
- **Video thumbnails (V1):** generic Phosphor icon, no real frame extraction (avoids bundling ffmpeg). Real frame extraction is a V1.1 candidate.
- **UI language: Portuguese** (all labels, buttons, the "Sem data" group bucket, etc.) — this overrides an earlier "English" decision from the first plan draft.
- **UI design: dark "contact-sheet/darkroom" theme.** Near-black background, dark-red accent (used sparingly: primary action, selected/editing state, progress fill), single centered column (no sidebar), monospace tabular numerals for counts/dates/timestamps, slightly rounded corners (~4–6px, not pill-shaped), hairline 1px dividers instead of card shadows, zero emoji (Phosphor icons only), simple `motion`-driven transitions between sub-states.
- **2 screens, not 3:** `SetupScreen` (source/destination pickers + threshold + inline analyze progress) and `ReviewScreen` (group list + inline copy progress + inline copy summary) — sub-states swap in place via `motion`'s `AnimatePresence` rather than navigating to new screens.
- **Input validation: zod.** Threshold input validated client-side (`src/shared/schemas.ts`) before enabling actions; every IPC payload validated at the main-process boundary (`src/shared/ipcSchemas.ts`) before use — untrusted-boundary discipline even though renderer and main ship together.
- **RAW test fixture:** skipped for V1 — no committed RAW sample file. `extractMetadata` is unit-tested against JPEG + video fixtures only; RAW support is exercised by `classifyMediaType` (extension-list unit test, no real file needed) and by the manual end-to-end test against a real SD card.
- **Corrupt/unreadable metadata files:** folded into the "Sem data" group with an error marker recorded (not a third bucket).
- **Copy conflict strategy:** always append a counter suffix on name collision (`IMG_0001.jpg` → `IMG_0001 (1).jpg`), never overwrite, never content-hash to detect duplicates (kept simple for V1).
- **Mobile/PWA:** explicitly out of scope for V1 (see spec's "Preparo pro PWA mobile futuro" section). The only concrete consequence for this plan: `src/shared/` must stay free of any Node/Electron import — enforced by file placement below, not by a lint rule (YAGNI for a single-runtime app today).

---

## File Structure

```
photo-sorter/
  electron.vite.config.ts
  electron-builder.yml
  package.json
  tsconfig.json  tsconfig.node.json  tsconfig.web.json
  vitest.config.ts
  src/
    main/
      index.ts                     # app bootstrap, BrowserWindow, lifecycle
      importSession.ts             # orchestration: scan -> metadata -> cluster, caches FileMeta[]
      ipc/handlers.ts              # ipcMain.handle registrations, zod-validated
      fs/scanFiles.ts
      fs/copyEngine.ts
      fs/sanitizeFolderName.ts
      metadata/exiftoolClient.ts
      metadata/extractMetadata.ts
      metadata/classifyMediaType.ts
      thumbnails/extractThumbnail.ts
    preload/
      index.ts                     # exposes window.saaraAPI
    renderer/
      index.html
      src/
        main.tsx  App.tsx  preload.d.ts
        theme.css                  # design tokens: colors, radius, spacing, typography
        screens/SetupScreen.tsx
        screens/ReviewScreen.tsx
        components/GroupCard.tsx  components/Thumbnail.tsx  components/ProgressBar.tsx
        hooks/useImportWorkflow.ts
    shared/
      types.ts                     # FileMeta, PhotoGroup, IPC payload shapes
      ipcChannels.ts                # channel name constants
      schemas.ts                    # zod: validateThresholdHours (UI-facing)
      ipcSchemas.ts                  # zod: IPC payload schemas (main-process boundary)
      clustering/clusterByGap.ts
      clustering/suggestGroupName.ts
  tests/
    unit/clustering/clusterByGap.test.ts
    unit/clustering/suggestGroupName.test.ts
    unit/metadata/classifyMediaType.test.ts
    unit/metadata/extractMetadata.test.ts
    unit/fs/scanFiles.test.ts
    unit/fs/copyEngine.test.ts
    unit/shared/schemas.test.ts
    fixtures/ (sample-photo.jpg, sample-video.mp4, sample-no-date.jpg, corrupt.jpg — added in the tasks that need them)
    manual/e2e-sd-card-import.md
```

**IPC contract** (`src/shared/ipcChannels.ts` + `src/shared/types.ts` + `src/shared/ipcSchemas.ts`):

| Channel | Direction | Payload → Result |
|---|---|---|
| `dialog:selectFolder` | invoke | `{ role: 'source'\|'destination' }` → `string \| null` |
| `import:analyze` | invoke | `{ sourcePath, thresholdMs }` → `{ groups: PhotoGroup[] }` |
| `import:analyze:progress` | main→renderer event | `{ phase: 'scanning'\|'reading-metadata'\|'clustering', current, total }` |
| `cluster:recompute` | invoke | `{ thresholdMs }` → `{ groups: PhotoGroup[] }` |
| `thumbnail:get` | invoke | `{ path, mediaType }` → `{ dataUrl: string } \| null` |
| `copy:start` | invoke | `{ destinationRoot, groups: PhotoGroup[] }` → `CopySummary` |
| `copy:progress` | main→renderer event | `{ groupId, groupName, fileName, filesCopiedSoFar, totalFiles }` |
| `shell:openPath` | invoke | `{ path }` → `void` |

`import:analyze` caches extracted `FileMeta[]` in `importSession.ts` so `cluster:recompute` can re-cluster on a threshold change without re-running exiftool. Single active session assumed (personal single-window app) — no job-id correlation needed. Every `ipcMain.handle` body starts by `.parse()`-ing its payload against the matching schema in `src/shared/ipcSchemas.ts`.

---

## Task 1: Scaffold Electron + TS + React app

**Files:**
- Create: entire scaffold via `electron-vite` template (package.json, electron.vite.config.ts, tsconfig*.json, src/main/index.ts, src/preload/index.ts, src/renderer/*)

- [ ] **Step 1: Run the scaffold command**

```bash
cd C:\www\personal\photo-sorter
npm create @quick-start/electron@latest . -- --template react-ts
```

When prompted about the directory not being empty (it has `docs/` and `.git/`), confirm proceeding — it will only add its own files.

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

- [ ] **Step 3: Set app identity**

Edit `package.json`, set the `"name"` field to `"saara"`.

Edit `src/renderer/index.html`, change the `<title>` tag content to `Saara`.

- [ ] **Step 4: Verify dev mode boots**

```bash
npm run dev
```

Expected: an Electron window opens, titled "Saara", showing the template's default React page. Close it, stop the process.

- [ ] **Step 5: Confirm docs/ untouched**

```bash
git status
```

Expected: `docs/superpowers/` shows no changes; new scaffold files appear as untracked/added.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron-vite react-ts app as Saara"
```

---

## Task 2: Add vitest tooling

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/unit/smoke.test.ts`
- Modify: `package.json` (add `test`, `test:watch`, `typecheck` scripts)

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Create vitest config**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['tests/unit/metadata/extractMetadata.test.ts'],
  },
})
```

(`extractMetadata.test.ts` is excluded from the default run because it spawns a real exiftool process — see Task 9's own vitest config.)

- [ ] **Step 3: Write smoke test**

```ts
// tests/unit/smoke.test.ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 4: Add package.json scripts**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:metadata": "vitest run --config vitest.metadata.config.ts",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test
```

Expected: PASS, 1 test.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts tests/unit/smoke.test.ts package.json package-lock.json
git commit -m "test: add vitest harness with smoke test"
```

---

## Task 3: Shared domain types + IPC channel constants

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/ipcChannels.ts`

- [ ] **Step 1: Write shared types**

```ts
// src/shared/types.ts

export type MediaType = 'photo' | 'raw' | 'video' | 'unsupported'

export interface FileMeta {
  path: string
  fileName: string
  mediaType: MediaType
  timestamp: string | null // ISO string; null = no date found
  timestampSource: 'DateTimeOriginal' | 'CreateDate' | 'MediaCreateDate' | null
  metadataError: string | null
}

export interface PhotoGroup {
  id: string
  name: string
  files: FileMeta[]
  startDate: string | null // ISO string
  endDate: string | null
  isNoDateGroup: boolean
}

export interface AnalyzeProgress {
  phase: 'scanning' | 'reading-metadata' | 'clustering'
  current: number
  total: number
}

export interface CopyPlanGroup {
  id: string
  name: string
  files: { sourcePath: string; fileName: string }[]
}

export interface CopyProgressEvent {
  groupId: string
  groupName: string
  fileName: string
  filesCopiedSoFar: number
  totalFiles: number
}

export interface CopySummary {
  totalFiles: number
  copiedFiles: number
  skippedFiles: number
  conflicts: { originalName: string; resolvedName: string }[]
  errors: { path: string; message: string }[]
}
```

- [ ] **Step 2: Write IPC channel constants**

```ts
// src/shared/ipcChannels.ts

export const IPC = {
  SELECT_FOLDER: 'dialog:selectFolder',
  ANALYZE: 'import:analyze',
  ANALYZE_PROGRESS: 'import:analyze:progress',
  RECOMPUTE_CLUSTERS: 'cluster:recompute',
  GET_THUMBNAIL: 'thumbnail:get',
  COPY_START: 'copy:start',
  COPY_PROGRESS: 'copy:progress',
  OPEN_PATH: 'shell:openPath',
} as const
```

- [ ] **Step 3: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: PASS, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/shared/ipcChannels.ts
git commit -m "feat: add shared domain types and IPC channel constants"
```

---

## Task 4: TDD — `clusterByGap`

**Files:**
- Test: `tests/unit/clustering/clusterByGap.test.ts`
- Create: `src/shared/clustering/clusterByGap.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/clustering/clusterByGap.test.ts
import { describe, it, expect } from 'vitest'
import { clusterByGap, type TimestampedFile } from '../../../src/shared/clustering/clusterByGap'

const DAY = 24 * 60 * 60 * 1000
const d = (iso: string) => new Date(iso)

describe('clusterByGap', () => {
  it('returns empty array for empty input', () => {
    expect(clusterByGap([], DAY)).toEqual([])
  })

  it('puts a single dated file in its own group', () => {
    const files: TimestampedFile[] = [{ path: 'a.jpg', timestamp: d('2026-08-01T10:00:00Z') }]
    const groups = clusterByGap(files, DAY)
    expect(groups).toHaveLength(1)
    expect(groups[0].files).toHaveLength(1)
    expect(groups[0].isNoDateGroup).toBe(false)
  })

  it('puts a single undated file in a no-date group', () => {
    const files: TimestampedFile[] = [{ path: 'a.jpg', timestamp: null }]
    const groups = clusterByGap(files, DAY)
    expect(groups).toHaveLength(1)
    expect(groups[0].isNoDateGroup).toBe(true)
    expect(groups[0].files).toHaveLength(1)
  })

  it('keeps files in the same group when gap exactly equals the threshold', () => {
    const t0 = d('2026-08-01T00:00:00Z')
    const t1 = new Date(t0.getTime() + DAY) // exactly 24h later
    const files: TimestampedFile[] = [
      { path: 'a.jpg', timestamp: t0 },
      { path: 'b.jpg', timestamp: t1 },
    ]
    const groups = clusterByGap(files, DAY)
    expect(groups).toHaveLength(1)
    expect(groups[0].files.map((f) => f.path)).toEqual(['a.jpg', 'b.jpg'])
  })

  it('starts a new group when gap exceeds the threshold by 1ms', () => {
    const t0 = d('2026-08-01T00:00:00Z')
    const t1 = new Date(t0.getTime() + DAY + 1)
    const files: TimestampedFile[] = [
      { path: 'a.jpg', timestamp: t0 },
      { path: 'b.jpg', timestamp: t1 },
    ]
    const groups = clusterByGap(files, DAY)
    expect(groups).toHaveLength(2)
    expect(groups[0].files.map((f) => f.path)).toEqual(['a.jpg'])
    expect(groups[1].files.map((f) => f.path)).toEqual(['b.jpg'])
  })

  it('sorts out-of-order input chronologically before clustering', () => {
    const t0 = d('2026-08-01T10:00:00Z')
    const t1 = d('2026-08-01T11:00:00Z')
    const t2 = d('2026-08-01T12:00:00Z')
    const files: TimestampedFile[] = [
      { path: 'c.jpg', timestamp: t2 },
      { path: 'a.jpg', timestamp: t0 },
      { path: 'b.jpg', timestamp: t1 },
    ]
    const groups = clusterByGap(files, DAY)
    expect(groups).toHaveLength(1)
    expect(groups[0].files.map((f) => f.path)).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
  })

  it('groups identical timestamps together (RAW+JPEG same shutter click)', () => {
    const t0 = d('2026-08-01T10:00:00Z')
    const files: TimestampedFile[] = [
      { path: 'IMG_0001.CR2', timestamp: t0 },
      { path: 'IMG_0001.JPG', timestamp: t0 },
    ]
    const groups = clusterByGap(files, DAY)
    expect(groups).toHaveLength(1)
    expect(groups[0].files).toHaveLength(2)
  })

  it('keeps undated files out of gap math and puts them in a trailing group', () => {
    const t0 = d('2026-08-01T10:00:00Z')
    const t1 = new Date(t0.getTime() + DAY + 1) // forces a new dated group
    const files: TimestampedFile[] = [
      { path: 'a.jpg', timestamp: t0 },
      { path: 'nodate1.jpg', timestamp: null },
      { path: 'b.jpg', timestamp: t1 },
      { path: 'nodate2.jpg', timestamp: null },
    ]
    const groups = clusterByGap(files, DAY)
    expect(groups).toHaveLength(3)
    expect(groups[0].isNoDateGroup).toBe(false)
    expect(groups[0].files.map((f) => f.path)).toEqual(['a.jpg'])
    expect(groups[1].isNoDateGroup).toBe(false)
    expect(groups[1].files.map((f) => f.path)).toEqual(['b.jpg'])
    expect(groups[2].isNoDateGroup).toBe(true)
    expect(groups[2].files.map((f) => f.path).sort()).toEqual(['nodate1.jpg', 'nodate2.jpg'])
  })

  it('handles all-undated input as a single no-date group, no crash', () => {
    const files: TimestampedFile[] = [
      { path: 'b.jpg', timestamp: null },
      { path: 'a.jpg', timestamp: null },
    ]
    const groups = clusterByGap(files, DAY)
    expect(groups).toHaveLength(1)
    expect(groups[0].isNoDateGroup).toBe(true)
    expect(groups[0].files.map((f) => f.path)).toEqual(['a.jpg', 'b.jpg']) // sorted by path
  })

  it('is deterministic for identical input', () => {
    const files: TimestampedFile[] = [
      { path: 'a.jpg', timestamp: d('2026-08-01T10:00:00Z') },
      { path: 'b.jpg', timestamp: d('2026-08-03T10:00:00Z') },
    ]
    const run1 = clusterByGap(files, DAY)
    const run2 = clusterByGap(files, DAY)
    expect(run1.map((g) => g.id)).toEqual(run2.map((g) => g.id))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/clustering/clusterByGap.test.ts
```

Expected: FAIL — `Cannot find module '../../../src/shared/clustering/clusterByGap'`.

- [ ] **Step 3: Implement `clusterByGap`**

```ts
// src/shared/clustering/clusterByGap.ts

export interface TimestampedFile {
  path: string
  timestamp: Date | null
}

export interface PhotoGroupResult {
  id: string
  files: TimestampedFile[]
  startDate: Date | null
  endDate: Date | null
  isNoDateGroup: boolean
}

export function clusterByGap(files: TimestampedFile[], thresholdMs: number): PhotoGroupResult[] {
  const dated = files.filter((f) => f.timestamp !== null)
  const undated = files.filter((f) => f.timestamp === null)

  dated.sort((a, b) => {
    const diff = a.timestamp!.getTime() - b.timestamp!.getTime()
    if (diff !== 0) return diff
    return a.path.localeCompare(b.path)
  })

  const groups: PhotoGroupResult[] = []
  let current: TimestampedFile[] = []

  for (const file of dated) {
    if (current.length === 0) {
      current.push(file)
      continue
    }
    const prev = current[current.length - 1]
    const gap = file.timestamp!.getTime() - prev.timestamp!.getTime()
    if (gap > thresholdMs) {
      groups.push(buildGroup(current, groups.length, false))
      current = [file]
    } else {
      current.push(file)
    }
  }
  if (current.length > 0) {
    groups.push(buildGroup(current, groups.length, false))
  }

  if (undated.length > 0) {
    const sortedUndated = [...undated].sort((a, b) => a.path.localeCompare(b.path))
    groups.push({
      id: 'group-nodate',
      files: sortedUndated,
      startDate: null,
      endDate: null,
      isNoDateGroup: true,
    })
  }

  return groups
}

function buildGroup(files: TimestampedFile[], index: number, isNoDateGroup: boolean): PhotoGroupResult {
  return {
    id: `group-${index}`,
    files,
    startDate: files[0].timestamp,
    endDate: files[files.length - 1].timestamp,
    isNoDateGroup,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/clustering/clusterByGap.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/clustering/clusterByGap.test.ts src/shared/clustering/clusterByGap.ts
git commit -m "feat: add clusterByGap event-clustering algorithm"
```

---

## Task 5: TDD — `suggestGroupName`

**Files:**
- Test: `tests/unit/clustering/suggestGroupName.test.ts`
- Create: `src/shared/clustering/suggestGroupName.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/clustering/suggestGroupName.test.ts
import { describe, it, expect } from 'vitest'
import { suggestGroupName } from '../../../src/shared/clustering/suggestGroupName'
import type { PhotoGroupResult } from '../../../src/shared/clustering/clusterByGap'

describe('suggestGroupName', () => {
  it('suggests a single date for a same-day group', () => {
    const group: PhotoGroupResult = {
      id: 'group-0',
      files: [],
      startDate: new Date('2026-08-11T09:00:00Z'),
      endDate: new Date('2026-08-11T18:00:00Z'),
      isNoDateGroup: false,
    }
    expect(suggestGroupName(group)).toBe('2026-08-11')
  })

  it('suggests a date range for a multi-day group', () => {
    const group: PhotoGroupResult = {
      id: 'group-0',
      files: [],
      startDate: new Date('2026-08-09T09:00:00Z'),
      endDate: new Date('2026-08-11T18:00:00Z'),
      isNoDateGroup: false,
    }
    expect(suggestGroupName(group)).toBe('2026-08-09_a_2026-08-11')
  })

  it('suggests "Sem data" for the no-date group', () => {
    const group: PhotoGroupResult = {
      id: 'group-nodate',
      files: [],
      startDate: null,
      endDate: null,
      isNoDateGroup: true,
    }
    expect(suggestGroupName(group)).toBe('Sem data')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/clustering/suggestGroupName.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `suggestGroupName`**

```ts
// src/shared/clustering/suggestGroupName.ts
import type { PhotoGroupResult } from './clusterByGap'

function toDateStamp(d: Date): string {
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

export function suggestGroupName(group: PhotoGroupResult): string {
  if (group.isNoDateGroup || !group.startDate || !group.endDate) {
    return 'Sem data'
  }
  const start = toDateStamp(group.startDate)
  const end = toDateStamp(group.endDate)
  return start === end ? start : `${start}_a_${end}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/clustering/suggestGroupName.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/clustering/suggestGroupName.test.ts src/shared/clustering/suggestGroupName.ts
git commit -m "feat: add suggestGroupName"
```

---

## Task 6: TDD — `classifyMediaType`

**Files:**
- Test: `tests/unit/metadata/classifyMediaType.test.ts`
- Create: `src/main/metadata/classifyMediaType.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/metadata/classifyMediaType.test.ts
import { describe, it, expect } from 'vitest'
import { classifyMediaType } from '../../../src/main/metadata/classifyMediaType'

describe('classifyMediaType', () => {
  it('classifies common photo extensions', () => {
    expect(classifyMediaType('a.jpg')).toBe('photo')
    expect(classifyMediaType('a.JPEG')).toBe('photo')
    expect(classifyMediaType('a.png')).toBe('photo')
  })

  it('classifies common RAW extensions', () => {
    expect(classifyMediaType('a.CR2')).toBe('raw')
    expect(classifyMediaType('a.nef')).toBe('raw')
    expect(classifyMediaType('a.ARW')).toBe('raw')
    expect(classifyMediaType('a.dng')).toBe('raw')
  })

  it('classifies common video extensions', () => {
    expect(classifyMediaType('a.mp4')).toBe('video')
    expect(classifyMediaType('a.MOV')).toBe('video')
  })

  it('classifies unknown extensions as unsupported', () => {
    expect(classifyMediaType('a.txt')).toBe('unsupported')
    expect(classifyMediaType('a')).toBe('unsupported')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/metadata/classifyMediaType.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `classifyMediaType`**

```ts
// src/main/metadata/classifyMediaType.ts
import path from 'node:path'
import type { MediaType } from '../../shared/types'

const PHOTO_EXT = new Set(['.jpg', '.jpeg', '.png', '.heic', '.tif', '.tiff'])
const RAW_EXT = new Set(['.cr2', '.cr3', '.nef', '.arw', '.dng', '.raf', '.orf', '.rw2'])
const VIDEO_EXT = new Set(['.mp4', '.mov', '.avi', '.mts', '.m4v'])

export function classifyMediaType(filePath: string): MediaType {
  const ext = path.extname(filePath).toLowerCase()
  if (PHOTO_EXT.has(ext)) return 'photo'
  if (RAW_EXT.has(ext)) return 'raw'
  if (VIDEO_EXT.has(ext)) return 'video'
  return 'unsupported'
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/metadata/classifyMediaType.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/metadata/classifyMediaType.test.ts src/main/metadata/classifyMediaType.ts
git commit -m "feat: add classifyMediaType"
```

---

## Task 7: TDD — zod validation (`validateThresholdHours`)

**Files:**
- Test: `tests/unit/shared/schemas.test.ts`
- Create: `src/shared/schemas.ts`

- [ ] **Step 1: Install zod**

```bash
npm install zod
```

- [ ] **Step 2: Write failing tests**

```ts
// tests/unit/shared/schemas.test.ts
import { describe, it, expect } from 'vitest'
import { validateThresholdHours } from '../../../src/shared/schemas'

describe('validateThresholdHours', () => {
  it('accepts a normal positive value', () => {
    expect(validateThresholdHours(24)).toEqual({ ok: true })
  })

  it('rejects zero', () => {
    expect(validateThresholdHours(0).ok).toBe(false)
  })

  it('rejects negative values', () => {
    expect(validateThresholdHours(-5).ok).toBe(false)
  })

  it('rejects values above the 720h (30 day) cap', () => {
    expect(validateThresholdHours(721).ok).toBe(false)
  })

  it('accepts the cap value itself', () => {
    expect(validateThresholdHours(720)).toEqual({ ok: true })
  })

  it('returns a Portuguese error message on failure', () => {
    const result = validateThresholdHours(0)
    if (result.ok) throw new Error('expected failure')
    expect(result.message).toMatch(/maior que zero/)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/unit/shared/schemas.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `validateThresholdHours`**

```ts
// src/shared/schemas.ts
import { z } from 'zod'

export const thresholdHoursSchema = z
  .number({ invalid_type_error: 'Informe um número.' })
  .positive('O intervalo deve ser maior que zero.')
  .max(24 * 30, 'O intervalo máximo é 720 horas (30 dias).')

export function validateThresholdHours(value: number): { ok: true } | { ok: false; message: string } {
  const result = thresholdHoursSchema.safeParse(value)
  if (result.success) return { ok: true }
  return { ok: false, message: result.error.issues[0]?.message ?? 'Valor inválido.' }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/unit/shared/schemas.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/shared/schemas.test.ts src/shared/schemas.ts package.json package-lock.json
git commit -m "feat: add zod-based threshold validation"
```

---

## Task 8: exiftool singleton client

**Files:**
- Create: `src/main/metadata/exiftoolClient.ts`
- Modify: `src/main/index.ts` (shutdown hook)

- [ ] **Step 1: Install exiftool-vendored**

```bash
npm install exiftool-vendored
```

- [ ] **Step 2: Create the singleton client**

```ts
// src/main/metadata/exiftoolClient.ts
import { ExifTool } from 'exiftool-vendored'

export const exiftool = new ExifTool({ maxProcs: 2 })

export async function shutdownExiftool(): Promise<void> {
  await exiftool.end()
}
```

- [ ] **Step 3: Wire shutdown into app lifecycle**

In `src/main/index.ts`, inside the existing Electron app setup, add:

```ts
import { shutdownExiftool } from './metadata/exiftoolClient'

app.on('will-quit', () => {
  void shutdownExiftool()
})
```

- [ ] **Step 4: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/metadata/exiftoolClient.ts src/main/index.ts package.json package-lock.json
git commit -m "feat: add exiftool singleton client with app shutdown hook"
```

---

## Task 9: TDD (real fixtures) — `extractMetadata`

**Files:**
- Create: `tests/fixtures/sample-photo.jpg`, `tests/fixtures/sample-video.mp4`, `tests/fixtures/sample-no-date.jpg`, `tests/fixtures/corrupt.jpg`
- Create: `vitest.metadata.config.ts`
- Test: `tests/unit/metadata/extractMetadata.test.ts`
- Create: `src/main/metadata/extractMetadata.ts`

- [ ] **Step 1: Add fixture files**

Add to `tests/fixtures/`:
- `sample-photo.jpg` — any small JPEG with `DateTimeOriginal` EXIF set (e.g. exported from your camera roll).
- `sample-video.mp4` — a short phone/camera video clip with creation-date metadata intact.
- `sample-no-date.jpg` — a JPEG with EXIF stripped (e.g. `exiftool -all= sample-photo.jpg -o sample-no-date.jpg`).
- `corrupt.jpg` — a truncated/invalid file (e.g. `head -c 100 sample-photo.jpg > corrupt.jpg` on WSL, or truncate via any hex editor).

These are binary fixtures you provide directly — RAW is skipped for V1 per the locked-in decision above.

- [ ] **Step 2: Create a separate vitest config for the metadata suite**

```ts
// vitest.metadata.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/metadata/extractMetadata.test.ts'],
    testTimeout: 15000,
  },
})
```

- [ ] **Step 3: Write failing tests**

```ts
// tests/unit/metadata/extractMetadata.test.ts
import { describe, it, expect, afterAll } from 'vitest'
import path from 'node:path'
import { extractFileMetadata } from '../../../src/main/metadata/extractMetadata'
import { shutdownExiftool } from '../../../src/main/metadata/exiftoolClient'

const fixture = (name: string) => path.join(__dirname, '../../fixtures', name)

describe('extractFileMetadata', () => {
  afterAll(async () => {
    await shutdownExiftool()
  })

  it('extracts DateTimeOriginal from a JPEG', async () => {
    const result = await extractFileMetadata(fixture('sample-photo.jpg'), 'photo')
    expect(result.timestamp).not.toBeNull()
    expect(result.timestampSource).toBe('DateTimeOriginal')
    expect(result.error).toBeUndefined()
  })

  it('extracts a creation date from a video', async () => {
    const result = await extractFileMetadata(fixture('sample-video.mp4'), 'video')
    expect(result.timestamp).not.toBeNull()
    expect(['DateTimeOriginal', 'CreateDate', 'MediaCreateDate']).toContain(result.timestampSource)
  })

  it('returns null timestamp for a file with no date tags, without throwing', async () => {
    const result = await extractFileMetadata(fixture('sample-no-date.jpg'), 'photo')
    expect(result.timestamp).toBeNull()
    expect(result.timestampSource).toBeNull()
  })

  it('returns an error for a corrupt file, without throwing', async () => {
    const result = await extractFileMetadata(fixture('corrupt.jpg'), 'photo')
    expect(result.timestamp).toBeNull()
    expect(result.error).toBeDefined()
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npm run test:metadata
```

Expected: FAIL — `extractMetadata` module not found.

- [ ] **Step 5: Implement `extractMetadata`**

```ts
// src/main/metadata/extractMetadata.ts
import { exiftool } from './exiftoolClient'
import type { MediaType } from '../../shared/types'

export interface ExtractedMetadata {
  path: string
  mediaType: MediaType
  timestamp: Date | null
  timestampSource: 'DateTimeOriginal' | 'CreateDate' | 'MediaCreateDate' | null
  error?: string
}

function isValidExifDate(value: unknown): value is { toDate: () => Date } {
  return !!value && typeof (value as { toDate?: unknown }).toDate === 'function'
}

export async function extractFileMetadata(
  filePath: string,
  mediaType: MediaType,
): Promise<ExtractedMetadata> {
  try {
    const tags = await exiftool.read(filePath)

    const candidates: Array<['DateTimeOriginal' | 'CreateDate' | 'MediaCreateDate', unknown]> =
      mediaType === 'video'
        ? [
            ['DateTimeOriginal', tags.DateTimeOriginal],
            ['CreateDate', tags.CreateDate],
            ['MediaCreateDate', (tags as Record<string, unknown>).MediaCreateDate],
          ]
        : [
            ['DateTimeOriginal', tags.DateTimeOriginal],
            ['CreateDate', tags.CreateDate],
          ]

    for (const [source, value] of candidates) {
      if (isValidExifDate(value)) {
        const date = value.toDate()
        if (!Number.isNaN(date.getTime()) && date.getTime() !== 0) {
          return { path: filePath, mediaType, timestamp: date, timestampSource: source }
        }
      }
    }

    return { path: filePath, mediaType, timestamp: null, timestampSource: null }
  } catch (err) {
    return {
      path: filePath,
      mediaType,
      timestamp: null,
      timestampSource: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function extractMetadataBatch(
  files: { path: string; mediaType: MediaType }[],
  onProgress?: (done: number, total: number) => void,
): Promise<ExtractedMetadata[]> {
  const results: ExtractedMetadata[] = []
  for (let i = 0; i < files.length; i++) {
    const { path, mediaType } = files[i]
    results.push(await extractFileMetadata(path, mediaType))
    onProgress?.(i + 1, files.length)
  }
  return results
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm run test:metadata
```

Expected: PASS, 4 tests. (`exiftool-vendored` types may not expose `DateTimeOriginal`/`CreateDate` identically across versions — if TS complains, check the installed package's `Tags` type and adjust field access accordingly; do not silently `any`-cast beyond the narrow spots above.)

- [ ] **Step 7: Commit**

```bash
git add tests/fixtures tests/unit/metadata/extractMetadata.test.ts vitest.metadata.config.ts src/main/metadata/extractMetadata.ts package.json
git commit -m "feat: add extractMetadata with real-fixture exiftool tests"
```

---

## Task 10: TDD — `scanFiles`

**Files:**
- Test: `tests/unit/fs/scanFiles.test.ts`
- Create: `src/main/fs/scanFiles.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/fs/scanFiles.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { scanFiles } from '../../../src/main/fs/scanFiles'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'saara-scan-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

async function touch(relPath: string) {
  const full = path.join(tmpDir, relPath)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, 'x')
}

describe('scanFiles', () => {
  it('finds supported media files recursively', async () => {
    await touch('a.jpg')
    await touch('sub/b.CR2')
    await touch('sub/deeper/c.mp4')

    const results = await scanFiles(tmpDir)
    const names = results.map((r) => path.basename(r.path)).sort()
    expect(names).toEqual(['a.jpg', 'b.CR2', 'c.mp4'])
  })

  it('excludes unsupported file types', async () => {
    await touch('a.jpg')
    await touch('notes.txt')
    await touch('Thumbs.db')

    const results = await scanFiles(tmpDir)
    expect(results.map((r) => path.basename(r.path))).toEqual(['a.jpg'])
  })

  it('returns an empty array for an empty directory', async () => {
    const results = await scanFiles(tmpDir)
    expect(results).toEqual([])
  })

  it('assigns the correct mediaType per file', async () => {
    await touch('a.jpg')
    await touch('b.CR2')
    await touch('c.mp4')

    const results = await scanFiles(tmpDir)
    const byName = Object.fromEntries(results.map((r) => [path.basename(r.path), r.mediaType]))
    expect(byName['a.jpg']).toBe('photo')
    expect(byName['b.CR2']).toBe('raw')
    expect(byName['c.mp4']).toBe('video')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/fs/scanFiles.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `scanFiles`**

```ts
// src/main/fs/scanFiles.ts
import fs from 'node:fs/promises'
import path from 'node:path'
import { classifyMediaType } from '../metadata/classifyMediaType'
import type { MediaType } from '../../shared/types'

export interface ScannedFile {
  path: string
  mediaType: MediaType
}

export async function scanFiles(rootDir: string): Promise<ScannedFile[]> {
  const results: ScannedFile[] = []

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile()) {
        const mediaType = classifyMediaType(fullPath)
        if (mediaType !== 'unsupported') {
          results.push({ path: fullPath, mediaType })
        }
      }
    }
  }

  await walk(rootDir)
  return results
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/fs/scanFiles.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/fs/scanFiles.test.ts src/main/fs/scanFiles.ts
git commit -m "feat: add recursive scanFiles"
```

---

## Task 11: TDD — `sanitizeFolderName` + `copyEngine`

**Files:**
- Test: `tests/unit/fs/copyEngine.test.ts`
- Create: `src/main/fs/sanitizeFolderName.ts`
- Create: `src/main/fs/copyEngine.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/fs/copyEngine.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { runCopyPlan, type CopyPlan } from '../../../src/main/fs/copyEngine'
import { sanitizeFolderName } from '../../../src/main/fs/sanitizeFolderName'

let srcDir: string
let destDir: string

beforeEach(async () => {
  srcDir = await fs.mkdtemp(path.join(os.tmpdir(), 'saara-src-'))
  destDir = await fs.mkdtemp(path.join(os.tmpdir(), 'saara-dest-'))
})

afterEach(async () => {
  await fs.rm(srcDir, { recursive: true, force: true })
  await fs.rm(destDir, { recursive: true, force: true })
})

async function writeSrcFile(name: string, content = 'x') {
  const full = path.join(srcDir, name)
  await fs.writeFile(full, content)
  return full
}

describe('sanitizeFolderName', () => {
  it('strips Windows-illegal characters', () => {
    expect(sanitizeFolderName('2026-08-09_a_2026-08-11')).toBe('2026-08-09_a_2026-08-11')
    expect(sanitizeFolderName('Trip: Paris/Rome?')).toBe('Trip Paris Rome')
  })

  it('trims trailing dots and spaces', () => {
    expect(sanitizeFolderName('Trip. ')).toBe('Trip')
  })
})

describe('runCopyPlan', () => {
  it('copies files into a per-group subfolder', async () => {
    const f1 = await writeSrcFile('IMG_0001.jpg')
    const plan: CopyPlan = {
      destinationRoot: destDir,
      groups: [{ id: 'group-0', name: '2026-08-11', files: [{ sourcePath: f1, fileName: 'IMG_0001.jpg' }] }],
    }
    const summary = await runCopyPlan(plan, () => {})
    expect(summary.copiedFiles).toBe(1)
    expect(summary.errors).toEqual([])
    const copied = await fs.readFile(path.join(destDir, '2026-08-11', 'IMG_0001.jpg'), 'utf-8')
    expect(copied).toBe('x')
  })

  it('never overwrites on name conflict, appends a suffix instead', async () => {
    const f1 = await writeSrcFile('IMG_0001.jpg', 'first')
    await fs.mkdir(path.join(destDir, '2026-08-11'), { recursive: true })
    await fs.writeFile(path.join(destDir, '2026-08-11', 'IMG_0001.jpg'), 'existing')

    const plan: CopyPlan = {
      destinationRoot: destDir,
      groups: [{ id: 'group-0', name: '2026-08-11', files: [{ sourcePath: f1, fileName: 'IMG_0001.jpg' }] }],
    }
    const summary = await runCopyPlan(plan, () => {})

    expect(summary.conflicts).toEqual([{ originalName: 'IMG_0001.jpg', resolvedName: 'IMG_0001 (1).jpg' }])
    const original = await fs.readFile(path.join(destDir, '2026-08-11', 'IMG_0001.jpg'), 'utf-8')
    expect(original).toBe('existing') // untouched
    const renamed = await fs.readFile(path.join(destDir, '2026-08-11', 'IMG_0001 (1).jpg'), 'utf-8')
    expect(renamed).toBe('first')
  })

  it('resolves multiple sequential conflicts without collision', async () => {
    const f1 = await writeSrcFile('a/IMG_0001.jpg', 'one')
    await fs.mkdir(path.join(destDir, 'g'), { recursive: true })
    await fs.writeFile(path.join(destDir, 'g', 'IMG_0001.jpg'), 'existing0')
    await fs.writeFile(path.join(destDir, 'g', 'IMG_0001 (1).jpg'), 'existing1')

    const plan: CopyPlan = {
      destinationRoot: destDir,
      groups: [{ id: 'group-0', name: 'g', files: [{ sourcePath: f1, fileName: 'IMG_0001.jpg' }] }],
    }
    const summary = await runCopyPlan(plan, () => {})
    expect(summary.conflicts[0].resolvedName).toBe('IMG_0001 (2).jpg')
  })

  it('preserves source mtime on the copied file', async () => {
    const f1 = await writeSrcFile('IMG_0002.jpg')
    const oldTime = new Date('2020-01-01T00:00:00Z')
    await fs.utimes(f1, oldTime, oldTime)

    const plan: CopyPlan = {
      destinationRoot: destDir,
      groups: [{ id: 'group-0', name: 'g', files: [{ sourcePath: f1, fileName: 'IMG_0002.jpg' }] }],
    }
    await runCopyPlan(plan, () => {})
    const destStat = await fs.stat(path.join(destDir, 'g', 'IMG_0002.jpg'))
    expect(Math.abs(destStat.mtime.getTime() - oldTime.getTime())).toBeLessThan(2000)
  })

  it('leaves the source file untouched after copy', async () => {
    const f1 = await writeSrcFile('IMG_0003.jpg', 'original-content')
    const plan: CopyPlan = {
      destinationRoot: destDir,
      groups: [{ id: 'group-0', name: 'g', files: [{ sourcePath: f1, fileName: 'IMG_0003.jpg' }] }],
    }
    await runCopyPlan(plan, () => {})
    const sourceContent = await fs.readFile(f1, 'utf-8')
    expect(sourceContent).toBe('original-content')
  })

  it('reports progress with correct running counts', async () => {
    const f1 = await writeSrcFile('a.jpg')
    const f2 = await writeSrcFile('b.jpg')
    const plan: CopyPlan = {
      destinationRoot: destDir,
      groups: [
        {
          id: 'group-0',
          name: 'g',
          files: [
            { sourcePath: f1, fileName: 'a.jpg' },
            { sourcePath: f2, fileName: 'b.jpg' },
          ],
        },
      ],
    }
    const events: number[] = []
    await runCopyPlan(plan, (e) => events.push(e.filesCopiedSoFar))
    expect(events).toEqual([1, 2])
  })

  it('gives distinct folders to two groups whose names sanitize to the same string', async () => {
    const f1 = await writeSrcFile('a.jpg')
    const f2 = await writeSrcFile('b.jpg')
    const plan: CopyPlan = {
      destinationRoot: destDir,
      groups: [
        { id: 'group-0', name: 'Trip: Paris', files: [{ sourcePath: f1, fileName: 'a.jpg' }] },
        { id: 'group-1', name: 'Trip Paris', files: [{ sourcePath: f2, fileName: 'b.jpg' }] },
      ],
    }
    await runCopyPlan(plan, () => {})
    const entries = await fs.readdir(destDir)
    expect(entries.sort()).toEqual(['Trip Paris', 'Trip Paris (2)'])
  })

  it("doesn't abort the rest of the job when one file fails", async () => {
    const f1 = await writeSrcFile('good.jpg')
    const plan: CopyPlan = {
      destinationRoot: destDir,
      groups: [
        {
          id: 'group-0',
          name: 'g',
          files: [
            { sourcePath: path.join(srcDir, 'missing.jpg'), fileName: 'missing.jpg' },
            { sourcePath: f1, fileName: 'good.jpg' },
          ],
        },
      ],
    }
    const summary = await runCopyPlan(plan, () => {})
    expect(summary.errors).toHaveLength(1)
    expect(summary.copiedFiles).toBe(1)
    const copied = await fs.readFile(path.join(destDir, 'g', 'good.jpg'), 'utf-8')
    expect(copied).toBe('x')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/fs/copyEngine.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `sanitizeFolderName`**

```ts
// src/main/fs/sanitizeFolderName.ts

export function sanitizeFolderName(name: string): string {
  const stripped = name.replace(/[\\/:*?"<>|]/g, '').trim()
  return stripped.replace(/[. ]+$/, '')
}
```

- [ ] **Step 4: Implement `copyEngine`**

```ts
// src/main/fs/copyEngine.ts
import fs from 'node:fs/promises'
import path from 'node:path'
import { sanitizeFolderName } from './sanitizeFolderName'
import type { CopyPlanGroup, CopyProgressEvent, CopySummary } from '../../shared/types'

export interface CopyPlan {
  destinationRoot: string
  groups: CopyPlanGroup[]
}

const CONCURRENCY = 4

async function uniqueFolderPath(destinationRoot: string, desiredName: string, taken: Set<string>): Promise<string> {
  let candidate = desiredName
  let counter = 2
  while (taken.has(candidate) || (await pathExists(path.join(destinationRoot, candidate)))) {
    candidate = `${desiredName} (${counter})`
    counter++
  }
  taken.add(candidate)
  return candidate
}

async function uniqueFilePath(dir: string, fileName: string): Promise<{ finalName: string; wasConflict: boolean }> {
  const ext = path.extname(fileName)
  const base = fileName.slice(0, fileName.length - ext.length)
  let candidate = fileName
  let counter = 1
  let wasConflict = false
  while (await pathExists(path.join(dir, candidate))) {
    candidate = `${base} (${counter})${ext}`
    counter++
    wasConflict = true
  }
  return { finalName: candidate, wasConflict }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function copyOne(
  sourcePath: string,
  destDir: string,
  fileName: string,
): Promise<{ resolvedName: string; conflict: boolean }> {
  const { finalName, wasConflict } = await uniqueFilePath(destDir, fileName)
  const destPath = path.join(destDir, finalName)
  await fs.copyFile(sourcePath, destPath)
  const stat = await fs.stat(sourcePath)
  await fs.utimes(destPath, stat.atime, stat.mtime)
  return { resolvedName: finalName, conflict: wasConflict }
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  async function next(): Promise<void> {
    const current = index++
    if (current >= items.length) return
    await worker(items[current])
    await next()
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()))
}

export async function runCopyPlan(
  plan: CopyPlan,
  onProgress: (e: CopyProgressEvent) => void,
): Promise<CopySummary> {
  const summary: CopySummary = { totalFiles: 0, copiedFiles: 0, skippedFiles: 0, conflicts: [], errors: [] }
  const takenFolderNames = new Set<string>()
  let copiedSoFar = 0
  const totalFiles = plan.groups.reduce((sum, g) => sum + g.files.length, 0)

  for (const group of plan.groups) {
    const folderName = await uniqueFolderPath(plan.destinationRoot, sanitizeFolderName(group.name), takenFolderNames)
    const destDir = path.join(plan.destinationRoot, folderName)
    await fs.mkdir(destDir, { recursive: true })

    await runPool(group.files, CONCURRENCY, async (file) => {
      summary.totalFiles++
      try {
        const { resolvedName, conflict } = await copyOne(file.sourcePath, destDir, file.fileName)
        summary.copiedFiles++
        if (conflict) {
          summary.conflicts.push({ originalName: file.fileName, resolvedName })
        }
      } catch (err) {
        summary.errors.push({ path: file.sourcePath, message: err instanceof Error ? err.message : String(err) })
      } finally {
        copiedSoFar++
        onProgress({
          groupId: group.id,
          groupName: group.name,
          fileName: file.fileName,
          filesCopiedSoFar: copiedSoFar,
          totalFiles,
        })
      }
    })
  }

  return summary
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/unit/fs/copyEngine.test.ts
```

Expected: PASS, 10 tests. (Note: the "reports progress with correct running counts" test assumes files within a single group copy in source order — with `CONCURRENCY = 4` and only 2 files, both run concurrently; if ordering flakes, assert on the set `{1,2}` reached rather than exact sequence. Prefer fixing the test assertion over reducing real concurrency.)

- [ ] **Step 6: Commit**

```bash
git add tests/unit/fs/copyEngine.test.ts src/main/fs/sanitizeFolderName.ts src/main/fs/copyEngine.ts
git commit -m "feat: add copyEngine with conflict-safe, mtime-preserving copy"
```

---

## Task 12: Thumbnail extraction

**Files:**
- Create: `src/main/thumbnails/extractThumbnail.ts`

- [ ] **Step 1: Implement thumbnail extraction**

Photo/RAW: read the embedded preview image via exiftool-vendored's binary tag extraction. Video: return `null` (renderer shows a generic Phosphor icon per the locked-in V1 decision).

```ts
// src/main/thumbnails/extractThumbnail.ts
import { exiftool } from '../metadata/exiftoolClient'
import type { MediaType } from '../../shared/types'

export async function extractThumbnail(filePath: string, mediaType: MediaType): Promise<string | null> {
  if (mediaType === 'video' || mediaType === 'unsupported') {
    return null
  }
  try {
    const buffer = await exiftool.extractBinaryTagToBuffer('ThumbnailImage', filePath).catch(() =>
      exiftool.extractBinaryTagToBuffer('PreviewImage', filePath),
    )
    if (!buffer || buffer.length === 0) return null
    return `data:image/jpeg;base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: PASS. (If `extractBinaryTagToBuffer` isn't the exact method name in the installed `exiftool-vendored` version, check its type definitions — `node_modules/exiftool-vendored/dist/ExifTool.d.ts` — and use the matching binary-extraction method; don't guess a different library.)

- [ ] **Step 3: Commit**

```bash
git add src/main/thumbnails/extractThumbnail.ts
git commit -m "feat: add thumbnail extraction for photo/RAW, null for video"
```

---

## Task 13: Main-process orchestration — `importSession`

**Files:**
- Create: `src/main/importSession.ts`

- [ ] **Step 1: Implement session orchestration**

```ts
// src/main/importSession.ts
import { scanFiles } from './fs/scanFiles'
import { extractMetadataBatch, type ExtractedMetadata } from './metadata/extractMetadata'
import { clusterByGap, type TimestampedFile } from '../shared/clustering/clusterByGap'
import { suggestGroupName } from '../shared/clustering/suggestGroupName'
import type { AnalyzeProgress, FileMeta, PhotoGroup } from '../shared/types'

let cachedMetadata: ExtractedMetadata[] = []

function toFileMeta(m: ExtractedMetadata, fileName: string): FileMeta {
  return {
    path: m.path,
    fileName,
    mediaType: m.mediaType,
    timestamp: m.timestamp ? m.timestamp.toISOString() : null,
    timestampSource: m.timestampSource,
    metadataError: m.error ?? null,
  }
}

function toPhotoGroups(metadata: ExtractedMetadata[], thresholdMs: number): PhotoGroup[] {
  const byPath = new Map(metadata.map((m) => [m.path, m]))
  const timestamped: TimestampedFile[] = metadata.map((m) => ({ path: m.path, timestamp: m.timestamp }))
  const clustered = clusterByGap(timestamped, thresholdMs)

  return clustered.map((g) => {
    const files = g.files.map((f) => {
      const meta = byPath.get(f.path)!
      return toFileMeta(meta, f.path.split(/[\\/]/).pop() ?? f.path)
    })
    return {
      id: g.id,
      name: suggestGroupName(g),
      files,
      startDate: g.startDate ? g.startDate.toISOString() : null,
      endDate: g.endDate ? g.endDate.toISOString() : null,
      isNoDateGroup: g.isNoDateGroup,
    }
  })
}

export async function analyzeSource(
  sourcePath: string,
  thresholdMs: number,
  onProgress: (p: AnalyzeProgress) => void,
): Promise<PhotoGroup[]> {
  onProgress({ phase: 'scanning', current: 0, total: 0 })
  const scanned = await scanFiles(sourcePath)

  onProgress({ phase: 'reading-metadata', current: 0, total: scanned.length })
  cachedMetadata = await extractMetadataBatch(
    scanned.map((s) => ({ path: s.path, mediaType: s.mediaType })),
    (done, total) => onProgress({ phase: 'reading-metadata', current: done, total }),
  )

  onProgress({ phase: 'clustering', current: 0, total: cachedMetadata.length })
  return toPhotoGroups(cachedMetadata, thresholdMs)
}

export function recluster(thresholdMs: number): PhotoGroup[] {
  return toPhotoGroups(cachedMetadata, thresholdMs)
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/importSession.ts
git commit -m "feat: add importSession orchestration with cached recluster"
```

---

## Task 14: IPC schemas + handlers + main bootstrap wiring

**Files:**
- Create: `src/shared/ipcSchemas.ts`
- Create: `src/main/ipc/handlers.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Write IPC payload schemas**

```ts
// src/shared/ipcSchemas.ts
import { z } from 'zod'

export const selectFolderRequestSchema = z.object({
  role: z.enum(['source', 'destination']),
})

export const analyzeRequestSchema = z.object({
  sourcePath: z.string().min(1),
  thresholdMs: z.number().positive(),
})

export const reclusterRequestSchema = z.object({
  thresholdMs: z.number().positive(),
})

export const getThumbnailRequestSchema = z.object({
  path: z.string().min(1),
  mediaType: z.enum(['photo', 'raw', 'video', 'unsupported']),
})

const copyPlanFileSchema = z.object({
  sourcePath: z.string().min(1),
  fileName: z.string().min(1),
})

const copyPlanGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  files: z.array(copyPlanFileSchema),
})

export const copyStartRequestSchema = z.object({
  destinationRoot: z.string().min(1),
  groups: z.array(copyPlanGroupSchema),
})

export const openPathRequestSchema = z.object({
  path: z.string().min(1),
})
```

- [ ] **Step 2: Implement IPC handlers (each validates its payload first)**

```ts
// src/main/ipc/handlers.ts
import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import {
  selectFolderRequestSchema,
  analyzeRequestSchema,
  reclusterRequestSchema,
  getThumbnailRequestSchema,
  copyStartRequestSchema,
  openPathRequestSchema,
} from '../../shared/ipcSchemas'
import { analyzeSource, recluster } from '../importSession'
import { runCopyPlan } from '../fs/copyEngine'
import { extractThumbnail } from '../thumbnails/extractThumbnail'

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.SELECT_FOLDER, async (_event, payload) => {
    const { role } = selectFolderRequestSchema.parse(payload)
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: role === 'source' ? 'Selecionar pasta de origem (cartão SD)' : 'Selecionar pasta de destino',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC.ANALYZE, async (_event, payload) => {
    const { sourcePath, thresholdMs } = analyzeRequestSchema.parse(payload)
    const groups = await analyzeSource(sourcePath, thresholdMs, (progress) => {
      getWindow()?.webContents.send(IPC.ANALYZE_PROGRESS, progress)
    })
    return { groups }
  })

  ipcMain.handle(IPC.RECOMPUTE_CLUSTERS, async (_event, payload) => {
    const { thresholdMs } = reclusterRequestSchema.parse(payload)
    return { groups: recluster(thresholdMs) }
  })

  ipcMain.handle(IPC.GET_THUMBNAIL, async (_event, payload) => {
    const { path, mediaType } = getThumbnailRequestSchema.parse(payload)
    const dataUrl = await extractThumbnail(path, mediaType)
    return dataUrl ? { dataUrl } : null
  })

  ipcMain.handle(IPC.COPY_START, async (_event, payload) => {
    const { destinationRoot, groups } = copyStartRequestSchema.parse(payload)
    return runCopyPlan({ destinationRoot, groups }, (progress) => {
      getWindow()?.webContents.send(IPC.COPY_PROGRESS, progress)
    })
  })

  ipcMain.handle(IPC.OPEN_PATH, async (_event, payload) => {
    const { path } = openPathRequestSchema.parse(payload)
    await shell.openPath(path)
  })
}
```

- [ ] **Step 3: Wire into `src/main/index.ts`**

Add near the existing `createWindow`/`app.whenReady` logic:

```ts
import { registerIpcHandlers } from './ipc/handlers'

let mainWindow: BrowserWindow | null = null
// (inside createWindow, after assigning the created window to mainWindow)

registerIpcHandlers(() => mainWindow)
```

Adjust variable naming to match whatever the scaffold's `index.ts` already calls its window variable — keep a single source of truth for "the current window" that `registerIpcHandlers`'s getter reads from.

- [ ] **Step 4: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Manual smoke check**

```bash
npm run dev
```

Expected: window opens with no console errors about missing IPC handlers.

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipcSchemas.ts src/main/ipc/handlers.ts src/main/index.ts
git commit -m "feat: wire zod-validated IPC handlers for analyze/recluster/thumbnail/copy"
```

---

## Task 15: Preload typed API surface (`window.saaraAPI`)

**Files:**
- Modify: `src/preload/index.ts`
- Create: `src/renderer/src/preload.d.ts`

- [ ] **Step 1: Expose a narrow typed API from preload**

```ts
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipcChannels'
import type {
  AnalyzeProgress,
  CopyPlanGroup,
  CopyProgressEvent,
  CopySummary,
  MediaType,
  PhotoGroup,
} from '../shared/types'

const api = {
  selectFolder: (role: 'source' | 'destination'): Promise<string | null> =>
    ipcRenderer.invoke(IPC.SELECT_FOLDER, { role }),

  analyze: (sourcePath: string, thresholdMs: number): Promise<{ groups: PhotoGroup[] }> =>
    ipcRenderer.invoke(IPC.ANALYZE, { sourcePath, thresholdMs }),

  onAnalyzeProgress: (cb: (p: AnalyzeProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, p: AnalyzeProgress) => cb(p)
    ipcRenderer.on(IPC.ANALYZE_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC.ANALYZE_PROGRESS, listener)
  },

  recluster: (thresholdMs: number): Promise<{ groups: PhotoGroup[] }> =>
    ipcRenderer.invoke(IPC.RECOMPUTE_CLUSTERS, { thresholdMs }),

  getThumbnail: (path: string, mediaType: MediaType): Promise<{ dataUrl: string } | null> =>
    ipcRenderer.invoke(IPC.GET_THUMBNAIL, { path, mediaType }),

  copyStart: (destinationRoot: string, groups: CopyPlanGroup[]): Promise<CopySummary> =>
    ipcRenderer.invoke(IPC.COPY_START, { destinationRoot, groups }),

  onCopyProgress: (cb: (p: CopyProgressEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, p: CopyProgressEvent) => cb(p)
    ipcRenderer.on(IPC.COPY_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC.COPY_PROGRESS, listener)
  },

  openPath: (path: string): Promise<void> => ipcRenderer.invoke(IPC.OPEN_PATH, { path }),
}

contextBridge.exposeInMainWorld('saaraAPI', api)

export type SaaraAPI = typeof api
```

- [ ] **Step 2: Declare the global type for the renderer**

```ts
// src/renderer/src/preload.d.ts
import type { SaaraAPI } from '../../preload'

declare global {
  interface Window {
    saaraAPI: SaaraAPI
  }
}

export {}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/renderer/src/preload.d.ts
git commit -m "feat: expose typed window.saaraAPI via contextBridge"
```

---

## Task 16: Design tokens + UI dependencies

**Files:**
- Create: `src/renderer/src/theme.css`
- Modify: `src/renderer/src/main.tsx`

- [ ] **Step 1: Install UI dependencies**

```bash
npm install @phosphor-icons/react motion
```

- [ ] **Step 2: Create the design tokens stylesheet**

```css
/* src/renderer/src/theme.css */

:root {
  --color-bg: #0a0a0a;
  --color-surface: #121212;
  --color-border: #232323;
  --color-text: #e8e8e8;
  --color-text-muted: #8a8a8a;
  --color-accent: #7f1d1d;
  --color-accent-hover: #991b1b;
  --color-danger: #b91c1c;

  --radius-sm: 4px;
  --radius-md: 6px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 40px;

  --font-sans: -apple-system, 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'SFMono-Regular', 'Cascadia Mono', Consolas, monospace;

  --max-content-width: 960px;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
}

.app-shell {
  max-width: var(--max-content-width);
  margin: 0 auto;
  padding: var(--space-5) var(--space-4);
}

.wordmark {
  font-weight: 600;
  letter-spacing: 0.02em;
  margin-bottom: var(--space-4);
}

.tabular-nums {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.field-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.field-value {
  color: var(--color-text-muted);
}

.field-error {
  color: var(--color-danger);
  font-size: 0.875rem;
  margin: var(--space-1) 0 0;
}

input,
.field {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  padding: var(--space-2);
  font-family: inherit;
}

input:focus,
.field:focus {
  outline: none;
  border-color: var(--color-accent);
}

button {
  font-family: inherit;
  border-radius: var(--radius-sm);
}

button.primary,
button.field-button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--color-accent);
  color: #fff;
  border: none;
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  transition:
    background-color 150ms ease,
    transform 100ms ease;
}

button.primary:hover,
button.field-button:hover {
  background: var(--color-accent-hover);
}

button.primary:active,
button.field-button:active {
  transform: scale(0.98);
}

button.primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

button.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: var(--space-1);
  cursor: pointer;
}

.hairline-divider {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: var(--space-3) 0;
}

.group-card {
  border-bottom: 1px solid var(--color-border);
  padding: var(--space-3) 0;
}

.group-card-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.group-card-thumbs {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
  flex-wrap: wrap;
}

.thumb {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.thumb-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
}

.progress-bar-track {
  position: relative;
  height: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  margin: var(--space-2) 0;
}

.progress-bar-fill {
  height: 100%;
  background: var(--color-accent);
  transition: width 200ms ease;
}
```

- [ ] **Step 3: Wire the stylesheet into the renderer entry point**

Open `src/renderer/src/main.tsx`. Remove any existing global CSS import the scaffold added (e.g. `./assets/main.css` or `./index.css`) and replace it with:

```ts
import './theme.css'
```

- [ ] **Step 4: Manual smoke check**

```bash
npm run dev
```

Expected: window background is near-black, no leftover scaffold styling.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/theme.css src/renderer/src/main.tsx package.json package-lock.json
git commit -m "feat: add Saara dark contact-sheet design tokens"
```

---

## Task 17: UI — `SetupScreen`

**Files:**
- Create: `src/renderer/src/hooks/useImportWorkflow.ts`
- Create: `src/renderer/src/screens/SetupScreen.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Create the workflow hook (reducer-based state machine, 2 stages)**

```ts
// src/renderer/src/hooks/useImportWorkflow.ts
import { useReducer, useCallback } from 'react'
import type { AnalyzeProgress, CopyProgressEvent, CopySummary, PhotoGroup } from '../../../shared/types'

type Stage = 'setup' | 'review'

interface State {
  stage: Stage
  sourcePath: string | null
  destinationPath: string | null
  thresholdHours: number
  analyzeProgress: AnalyzeProgress | null
  groups: PhotoGroup[]
  copying: boolean
  copyProgress: CopyProgressEvent | null
  copySummary: CopySummary | null
}

type Action =
  | { type: 'SET_SOURCE'; path: string }
  | { type: 'SET_DESTINATION'; path: string }
  | { type: 'SET_THRESHOLD_HOURS'; hours: number }
  | { type: 'ANALYZE_PROGRESS'; progress: AnalyzeProgress }
  | { type: 'ANALYZE_DONE'; groups: PhotoGroup[] }
  | { type: 'SET_GROUPS'; groups: PhotoGroup[] }
  | { type: 'START_COPY' }
  | { type: 'COPY_PROGRESS'; progress: CopyProgressEvent }
  | { type: 'COPY_DONE'; summary: CopySummary }

const initialState: State = {
  stage: 'setup',
  sourcePath: null,
  destinationPath: null,
  thresholdHours: 24,
  analyzeProgress: null,
  groups: [],
  copying: false,
  copyProgress: null,
  copySummary: null,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_SOURCE':
      return { ...state, sourcePath: action.path }
    case 'SET_DESTINATION':
      return { ...state, destinationPath: action.path }
    case 'SET_THRESHOLD_HOURS':
      return { ...state, thresholdHours: action.hours }
    case 'ANALYZE_PROGRESS':
      return { ...state, analyzeProgress: action.progress }
    case 'ANALYZE_DONE':
      return { ...state, stage: 'review', groups: action.groups, analyzeProgress: null }
    case 'SET_GROUPS':
      return { ...state, groups: action.groups }
    case 'START_COPY':
      return { ...state, copying: true, copyProgress: null, copySummary: null }
    case 'COPY_PROGRESS':
      return { ...state, copyProgress: action.progress }
    case 'COPY_DONE':
      return { ...state, copying: false, copySummary: action.summary }
    default:
      return state
  }
}

export function useImportWorkflow() {
  const [state, dispatch] = useReducer(reducer, initialState)

  const pickSource = useCallback(async () => {
    const path = await window.saaraAPI.selectFolder('source')
    if (path) dispatch({ type: 'SET_SOURCE', path })
  }, [])

  const pickDestination = useCallback(async () => {
    const path = await window.saaraAPI.selectFolder('destination')
    if (path) dispatch({ type: 'SET_DESTINATION', path })
  }, [])

  const setThresholdHours = useCallback((hours: number) => {
    dispatch({ type: 'SET_THRESHOLD_HOURS', hours })
  }, [])

  const analyze = useCallback(async () => {
    if (!state.sourcePath) return
    const unsubscribe = window.saaraAPI.onAnalyzeProgress((progress) => {
      dispatch({ type: 'ANALYZE_PROGRESS', progress })
    })
    const { groups } = await window.saaraAPI.analyze(state.sourcePath, state.thresholdHours * 3600_000)
    unsubscribe()
    dispatch({ type: 'ANALYZE_DONE', groups })
  }, [state.sourcePath, state.thresholdHours])

  const recluster = useCallback(async (hours: number) => {
    dispatch({ type: 'SET_THRESHOLD_HOURS', hours })
    const { groups } = await window.saaraAPI.recluster(hours * 3600_000)
    dispatch({ type: 'SET_GROUPS', groups })
  }, [])

  const renameGroup = useCallback(
    (groupId: string, name: string) => {
      dispatch({ type: 'SET_GROUPS', groups: state.groups.map((g) => (g.id === groupId ? { ...g, name } : g)) })
    },
    [state.groups],
  )

  const startCopy = useCallback(async () => {
    if (!state.destinationPath) return
    dispatch({ type: 'START_COPY' })
    const unsubscribe = window.saaraAPI.onCopyProgress((progress) => {
      dispatch({ type: 'COPY_PROGRESS', progress })
    })
    const summary = await window.saaraAPI.copyStart(
      state.destinationPath,
      state.groups.map((g) => ({
        id: g.id,
        name: g.name,
        files: g.files.map((f) => ({ sourcePath: f.path, fileName: f.fileName })),
      })),
    )
    unsubscribe()
    dispatch({ type: 'COPY_DONE', summary })
  }, [state.destinationPath, state.groups])

  return { state, pickSource, pickDestination, setThresholdHours, analyze, recluster, renameGroup, startCopy }
}
```

- [ ] **Step 2: Create `SetupScreen`**

```tsx
// src/renderer/src/screens/SetupScreen.tsx
import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FolderOpen, MagnifyingGlass } from '@phosphor-icons/react'
import { validateThresholdHours } from '../../../shared/schemas'
import type { useImportWorkflow } from '../hooks/useImportWorkflow'

const PHASE_LABELS: Record<string, string> = {
  scanning: 'Escaneando arquivos',
  'reading-metadata': 'Lendo metadata',
  clustering: 'Agrupando',
}

interface Props {
  workflow: ReturnType<typeof useImportWorkflow>
}

export function SetupScreen({ workflow }: Props) {
  const { state, pickSource, pickDestination, setThresholdHours, analyze } = workflow
  const [thresholdError, setThresholdError] = useState<string | null>(null)

  function handleThresholdChange(value: number) {
    const result = validateThresholdHours(value)
    setThresholdError(result.ok ? null : result.message)
    setThresholdHours(value)
  }

  const canAnalyze = !!state.sourcePath && !!state.destinationPath && !thresholdError && !state.analyzeProgress

  return (
    <div>
      <h1 className="wordmark">Saara</h1>

      <AnimatePresence mode="wait">
        {state.analyzeProgress ? (
          <motion.div
            key="progress"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <p>{PHASE_LABELS[state.analyzeProgress.phase] ?? state.analyzeProgress.phase}</p>
            <p className="tabular-nums">
              {state.analyzeProgress.current}/{state.analyzeProgress.total}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="field-row">
              <button className="field-button" onClick={pickSource}>
                <FolderOpen size={18} />
                Selecionar pasta de origem (cartão SD)
              </button>
              <span className="field-value">{state.sourcePath ?? 'Nenhuma origem selecionada'}</span>
            </div>

            <div className="field-row">
              <button className="field-button" onClick={pickDestination}>
                <FolderOpen size={18} />
                Selecionar pasta de destino
              </button>
              <span className="field-value">{state.destinationPath ?? 'Nenhum destino selecionado'}</span>
            </div>

            <div className="field-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <label htmlFor="threshold">Intervalo entre grupos (horas)</label>
              <input
                id="threshold"
                type="number"
                min={1}
                className="field"
                value={state.thresholdHours}
                onChange={(e) => handleThresholdChange(Number(e.target.value))}
              />
              {thresholdError && <p className="field-error">{thresholdError}</p>}
            </div>

            <button className="primary" disabled={!canAnalyze} onClick={analyze}>
              <MagnifyingGlass size={18} />
              Analisar
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 3: Wire into `App.tsx` (interim — `ReviewScreen` lands in Task 18)**

```tsx
// src/renderer/src/App.tsx
import { useImportWorkflow } from './hooks/useImportWorkflow'
import { SetupScreen } from './screens/SetupScreen'

export default function App() {
  const workflow = useImportWorkflow()

  return (
    <div className="app-shell">
      {workflow.state.stage === 'setup' ? <SetupScreen workflow={workflow} /> : <p>Tela de revisão (Task 18)</p>}
    </div>
  )
}
```

- [ ] **Step 4: Manual smoke check**

```bash
npm run dev
```

Expected: dark-themed setup screen; source/destination buttons open native folder dialogs; typing an invalid threshold (0 or negative) shows a Portuguese error and disables "Analisar".

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks/useImportWorkflow.ts src/renderer/src/screens/SetupScreen.tsx src/renderer/src/App.tsx
git commit -m "feat: add SetupScreen with zod-validated threshold input"
```

---

## Task 18: UI — `ReviewScreen` (GroupCard, Thumbnail, ProgressBar) + final App wiring

**Files:**
- Create: `src/renderer/src/components/Thumbnail.tsx`
- Create: `src/renderer/src/components/GroupCard.tsx`
- Create: `src/renderer/src/components/ProgressBar.tsx`
- Create: `src/renderer/src/screens/ReviewScreen.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Create `Thumbnail` component**

```tsx
// src/renderer/src/components/Thumbnail.tsx
import { useEffect, useState } from 'react'
import { FilmSlate, ImageBroken } from '@phosphor-icons/react'
import type { MediaType } from '../../../shared/types'

interface Props {
  path: string
  mediaType: MediaType
}

export function Thumbnail({ path, mediaType }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (mediaType === 'video') {
      setDataUrl(null)
      return
    }
    window.saaraAPI.getThumbnail(path, mediaType).then((result) => {
      if (cancelled) return
      if (result) setDataUrl(result.dataUrl)
      else setFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [path, mediaType])

  if (mediaType === 'video')
    return (
      <div className="thumb thumb-icon">
        <FilmSlate size={24} />
      </div>
    )
  if (failed)
    return (
      <div className="thumb thumb-icon">
        <ImageBroken size={24} />
      </div>
    )
  if (!dataUrl) return <div className="thumb" />
  return <img className="thumb" src={dataUrl} alt="" />
}
```

- [ ] **Step 2: Create `GroupCard` component**

```tsx
// src/renderer/src/components/GroupCard.tsx
import { useState } from 'react'
import { CaretRight, CaretDown } from '@phosphor-icons/react'
import type { PhotoGroup } from '../../../shared/types'
import { Thumbnail } from './Thumbnail'

interface Props {
  group: PhotoGroup
  onRename: (name: string) => void
}

export function GroupCard({ group, onRename }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="group-card">
      <div className="group-card-header">
        <button className="icon-button" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <CaretDown size={16} /> : <CaretRight size={16} />}
        </button>
        <input className="field" value={group.name} onChange={(e) => onRename(e.target.value)} />
        <span className="tabular-nums">{group.files.length} arquivos</span>
        <span className="tabular-nums">
          {group.isNoDateGroup
            ? 'Sem data'
            : group.startDate === group.endDate
              ? group.startDate?.slice(0, 10)
              : `${group.startDate?.slice(0, 10)} – ${group.endDate?.slice(0, 10)}`}
        </span>
      </div>
      <div className="group-card-thumbs">
        {group.files.slice(0, 6).map((f) => (
          <Thumbnail key={f.path} path={f.path} mediaType={f.mediaType} />
        ))}
      </div>
      {expanded && (
        <ul>
          {group.files.map((f) => (
            <li key={f.path}>
              {f.fileName} {f.metadataError ? `(erro: ${f.metadataError})` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `ProgressBar` component**

```tsx
// src/renderer/src/components/ProgressBar.tsx
interface Props {
  current: number
  total: number
}

export function ProgressBar({ current, total }: Props) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div className="progress-bar-track">
      <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      <span className="tabular-nums">
        {current}/{total}
      </span>
    </div>
  )
}
```

- [ ] **Step 4: Create `ReviewScreen`**

```tsx
// src/renderer/src/screens/ReviewScreen.tsx
import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FolderOpen, CheckCircle, WarningCircle } from '@phosphor-icons/react'
import { validateThresholdHours } from '../../../shared/schemas'
import { GroupCard } from '../components/GroupCard'
import { ProgressBar } from '../components/ProgressBar'
import type { useImportWorkflow } from '../hooks/useImportWorkflow'

interface Props {
  workflow: ReturnType<typeof useImportWorkflow>
}

export function ReviewScreen({ workflow }: Props) {
  const { state, recluster, renameGroup, startCopy } = workflow
  const [thresholdError, setThresholdError] = useState<string | null>(null)

  function handleThresholdChange(value: number) {
    const result = validateThresholdHours(value)
    setThresholdError(result.ok ? null : result.message)
    if (result.ok) recluster(value)
  }

  const totalFiles = state.groups.reduce((sum, g) => sum + g.files.length, 0)
  const subView = state.copySummary ? 'done' : state.copying ? 'copying' : 'reviewing'

  return (
    <div>
      <AnimatePresence mode="wait">
        {subView === 'reviewing' && (
          <motion.div
            key="reviewing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <h1>Revisar grupos</h1>
            <p className="tabular-nums">
              {state.groups.length} grupos, {totalFiles} arquivos no total
            </p>
            <div className="field-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <label htmlFor="threshold-review">Intervalo entre grupos (horas)</label>
              <input
                id="threshold-review"
                type="number"
                min={1}
                className="field"
                value={state.thresholdHours}
                onChange={(e) => handleThresholdChange(Number(e.target.value))}
              />
              {thresholdError && <p className="field-error">{thresholdError}</p>}
            </div>
            <hr className="hairline-divider" />
            {state.groups.map((g) => (
              <GroupCard key={g.id} group={g} onRename={(name) => renameGroup(g.id, name)} />
            ))}
            <button className="primary" onClick={startCopy} style={{ marginTop: 'var(--space-4)' }}>
              Confirmar e copiar
            </button>
          </motion.div>
        )}

        {subView === 'copying' && (
          <motion.div
            key="copying"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <h1>Copiando arquivos…</h1>
            {state.copyProgress && (
              <>
                <p>
                  {state.copyProgress.groupName}: {state.copyProgress.fileName}
                </p>
                <ProgressBar current={state.copyProgress.filesCopiedSoFar} total={state.copyProgress.totalFiles} />
              </>
            )}
          </motion.div>
        )}

        {subView === 'done' && state.copySummary && (
          <motion.div
            key="done"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <h1>
              <CheckCircle size={22} /> Cópia concluída
            </h1>
            <p className="tabular-nums">
              {state.copySummary.copiedFiles}/{state.copySummary.totalFiles} arquivos copiados
            </p>
            {state.copySummary.conflicts.length > 0 && (
              <p>
                <WarningCircle size={16} /> {state.copySummary.conflicts.length} conflitos de nome resolvidos
                (renomeados, nada sobrescrito)
              </p>
            )}
            {state.copySummary.errors.length > 0 && (
              <p>
                <WarningCircle size={16} /> {state.copySummary.errors.length} arquivos falharam ao copiar
              </p>
            )}
            <button
              className="primary"
              disabled={!state.destinationPath}
              onClick={() => state.destinationPath && window.saaraAPI.openPath(state.destinationPath)}
            >
              <FolderOpen size={18} /> Abrir pasta de destino
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 5: Finalize `App.tsx`**

```tsx
// src/renderer/src/App.tsx
import { AnimatePresence, motion } from 'motion/react'
import { useImportWorkflow } from './hooks/useImportWorkflow'
import { SetupScreen } from './screens/SetupScreen'
import { ReviewScreen } from './screens/ReviewScreen'

export default function App() {
  const workflow = useImportWorkflow()

  return (
    <div className="app-shell">
      <AnimatePresence mode="wait">
        {workflow.state.stage === 'setup' ? (
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <SetupScreen workflow={workflow} />
          </motion.div>
        ) : (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <ReviewScreen workflow={workflow} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 6: Manual smoke check — full flow**

```bash
npm run dev
```

Point source at a local folder with a handful of test JPEGs, pick any destination folder, run the full flow: Analisar → revisar/renomear grupos → Confirmar e copiar → watch the inline progress swap to the completion summary. Confirm the screen-level transition (setup → review) and sub-state transitions (reviewing → copying → done) animate smoothly, thumbnails load, and "Sem data" files land in their own group.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/Thumbnail.tsx src/renderer/src/components/GroupCard.tsx src/renderer/src/components/ProgressBar.tsx src/renderer/src/screens/ReviewScreen.tsx src/renderer/src/App.tsx
git commit -m "feat: add ReviewScreen with inline copy progress and animated transitions"
```

---

## Task 19: electron-builder packaging for Windows

**Files:**
- Create: `electron-builder.yml`
- Modify: `package.json` (`build:win` script — likely already added by the scaffold; verify/adjust)

- [ ] **Step 1: Write electron-builder config with Saara branding and the exiftool asarUnpack fix**

```yaml
# electron-builder.yml
appId: com.saara.app
productName: Saara
directories:
  output: release
files:
  - out/**/*
asarUnpack:
  - node_modules/exiftool-vendored.exe/**
  - node_modules/exiftool-vendored.pl/**
win:
  target: nsis
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

- [ ] **Step 2: Ensure build scripts exist in package.json**

```json
{
  "scripts": {
    "build": "electron-vite build",
    "build:win": "npm run build && electron-builder --win --config electron-builder.yml"
  }
}
```

- [ ] **Step 3: Build the Windows installer**

```bash
npm run build:win
```

Expected: completes without error, produces a "Saara" installer under `release/`.

- [ ] **Step 4: Install and smoke-test the packaged build**

Run the generated installer, launch the installed app (not `npm run dev`), pick a small local test folder as source, run Analisar, and confirm thumbnails/metadata still resolve correctly — this is the check that catches the exiftool-binary-inside-asar failure mode if `asarUnpack` is misconfigured.

- [ ] **Step 5: Commit**

```bash
git add electron-builder.yml package.json
git commit -m "build: add electron-builder Windows packaging config for Saara"
```

---

## Task 20: Manual end-to-end test procedure (real SD card)

**Files:**
- Create: `tests/manual/e2e-sd-card-import.md`

- [ ] **Step 1: Write the manual test procedure**

```markdown
# Manual E2E Test — Real SD Card Import

Prerequisites: a camera SD card with a real mix of JPEG/RAW/video files, packaged
Saara app installed (Task 19), an empty local destination folder.

## Steps

1. Note the exact file count on the SD card (e.g. `Get-ChildItem -Recurse -File | Measure-Object`
   on the source drive, filtered to media extensions) as the baseline count N.
2. Launch Saara (installed build, not dev mode).
3. Select the SD card as source, an empty local folder as destination.
4. Leave threshold at the default (24h) or adjust; click "Analisar".
5. Confirm the review screen shows groups with plausible date ranges, thumbnails load for
   photos/RAW, video files show the generic Phosphor icon, and any files with no EXIF date
   land in a single "Sem data" group.
6. Rename at least one group manually; confirm the rename sticks.
7. Adjust the threshold input and confirm groups visibly recompute without a
   re-scan delay (should be near-instant — cached metadata, no exiftool re-run).
8. Click "Confirmar e copiar".
9. Watch the inline progress swap update per-file; wait for completion.
10. On the completion view, confirm copied-file count equals N (no photos lost).
11. Verify destination folder structure: one subfolder per group, correctly named,
    containing the expected files.
12. Verify the SD card is byte-for-byte untouched: re-run the same file count from
    step 1 on the source and confirm it still equals N, and spot-check a few file
    hashes/sizes match their pre-copy state.
13. Re-run the same import a second time into the same destination (simulating a
    re-import) and confirm conflicting files are suffixed (`(1)`, `(2)`, …) rather
    than overwritten, and the completion summary reports the conflict count.

## Pass criteria

- Destination file count == source file count (N) after step 10.
- Source unchanged after step 12.
- No silent overwrites on re-import (step 13).
- No app crash or unhandled error at any step.
```

- [ ] **Step 2: Commit**

```bash
git add tests/manual/e2e-sd-card-import.md
git commit -m "docs: add manual E2E test procedure for real SD card import"
```

- [ ] **Step 3: Execute the procedure**

Run `tests/manual/e2e-sd-card-import.md` against your actual camera SD card once Tasks 1–19 are complete and committed. This requires your physical hardware and can't be automated — do this as a final manual verification pass, not a scripted step.

---

## Verification (full plan)

After all tasks are complete:

```bash
npm run typecheck
npm test
npm run test:metadata
npm run build:win
```

All four must succeed. Then run the manual E2E procedure (Task 20, Step 3) against a real SD card as the final acceptance check — this is the only step that verifies the spec's core promise end-to-end: photos survive the round trip 1:1, grouped sensibly, with the source untouched.
