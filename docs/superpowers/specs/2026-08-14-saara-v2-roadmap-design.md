# Saara V2 Roadmap: Drive Destination, Lightbox & Beyond

**Status:** design approved by user (2026-08-14), not yet implemented.

## Context

V1.1 (home redesign — dropzones, settings, English UI) is done and committed to `master`. During live testing of V1.1, the user identified several features missing from the app entirely, not just from V1.1's scope. This spec breaks that wishlist into ordered checkpoints, each meant to be brainstormed/planned/built as its own cycle (the user works across multiple sessions and wants to pick up a checkpoint at a time).

**Checkpoint order (confirmed with user, reordered once mid-brainstorm — Drive moved up because it's needed for the app's MVP):**

1. **Google Drive as an alternate destination** — fully speced below. Needed for MVP.
2. **Full-screen lightbox + selection + delete/move/rename** — fully speced below.
3. **Reorganize before copy** — drag-and-drop reorder, move files between folders, create/delete folders. Only scoped at a high level below; needs its own brainstorming pass when picked up.
4. **Share links (Drive Phase 2)** — one shareable link per Drive group-folder, so photos can be sent to friends. Depends on Checkpoint 1 being done first. Not designed in detail yet.

**Backlog (explicitly out of scope for now, noted so they aren't lost):**

- **Undo** — user said this "could come in the future." No checkpoint assigned. When it's picked up, revisit Checkpoint 2's architecture decision (edits mutate `state.groups` directly, no diff/edit-log layer) — undo would likely need an edit-log or snapshot approach layered on top.
- **Add new photos into an existing group after analysis** — user flagged this themselves as a risk: "acho que pode acabar perdendo a ideia principal do app" (might dilute the app's core "analyze once, sort once, copy once" idea). Parked, not designed, revisit only if there's a clear need.
- **Change file extension** (rename beyond just the filename) — user mentioned this "para os próximos planos" (for future plans), explicitly after rename (Checkpoint 2). Not designed.

---

## Checkpoint 1: Google Drive as an alternate destination

### Why this order

The user needs Drive support for their MVP — sorted photos should be able to land in Drive instead of (not necessarily in addition to) a local folder, so they can be shared/accessed without a local destination drive attached.

### Prerequisite (manual, outside this codebase)

Before implementation can start, the user needs to create, in Google Cloud Console (using their own Google account — this is not something an agent can do on their behalf):

1. A Google Cloud project.
2. An OAuth consent screen (External or Internal, Testing mode is fine for personal use — avoids Google's verification review process as long as the test-user list includes the account(s) that'll use the app).
3. An OAuth Client ID of type **Desktop app**.
4. Enable the **Google Drive API** for the project.
5. Note the Client ID and Client Secret — these get embedded in the app (Desktop-app OAuth clients are not treated as confidential secrets by Google, so this is expected/normal for this flow, unlike a server-side web app client).

This should be the first task in Checkpoint 1's implementation plan: a written checklist for the user to complete by hand, blocking everything else.

### Auth flow

- OAuth 2.0 "installed app" flow using a **loopback IP redirect** (`http://127.0.0.1:<ephemeral-port>/callback`), opening the URL in the user's default system browser via Electron's `shell.openExternal`. Not an embedded `BrowserWindow` — Google disallows OAuth via embedded webviews for this flow.
- Main process spins up a short-lived local HTTP server on an ephemeral port to catch the redirect, extracts the auth code, exchanges it for access + refresh tokens, then shuts the server down.
- Scope: `https://www.googleapis.com/auth/drive.file` (access limited to files/folders the app creates — not full Drive access; least-privilege, and avoids the stricter Google verification requirements that broader scopes trigger).

### Credential storage

- New file: `userData/driveAuth.json`, containing the refresh token **encrypted via Electron's `safeStorage`** (OS-level encryption — DPAPI on Windows). Separate from `userData/settings.json` (which stays plaintext — threshold-hours isn't sensitive, a refresh token is).
- New module: `src/main/drive/driveAuthStore.ts`, mirroring `settingsStore.ts`'s shape (`getToken`/`setToken`/`clearToken`, `userDataDir` as a DI'd parameter for testability), but storing an encrypted blob instead of validated JSON.
- New IPC channels: `DRIVE_CONNECT` (kicks off the browser-based flow, resolves with the connected account email once tokens are stored), `DRIVE_STATUS` (returns `{ connected: boolean, email: string | null }` without triggering a flow), `DRIVE_DISCONNECT` (clears stored tokens).

### Destination model changes

- `useImportWorkflow`'s state gains `destinationType: 'local' | 'drive'` (default `'local'`).
- The existing Destination `Dropzone` box gets a small floating icon button in its top-right corner: a Drive icon. Clicking it toggles `destinationType` to `'drive'` and the icon flips to a folder icon (so clicking again toggles back to `'local'`). This is built as a simple toggle now; the user described it as *"acting like a toggle for now, but later as a tab"* — so keep the click handler and the two-icon-swap logic in a small self-contained piece (e.g. a `destinationType` prop + `onToggle` callback) that a future tabbed UI could reuse without a rewrite, but don't build tabs now.
- When `destinationType === 'drive'`:
  - If not connected: the box shows a "Connect Google Drive" prompt instead of the drop/browse hint; clicking it calls `DRIVE_CONNECT`.
  - If connected: the box shows the connected account's email instead of a folder path. No folder browsing/picking UI.
- **No Drive folder picker.** On first connect (or first Drive-destination use), the app finds-or-creates one app-managed root folder, e.g. named `"Saara"`, directly under "My Drive". All group folders for every session live under this one root. This matches `drive.file` scope semantics well (the app only ever needs to see files/folders it created itself).

### Upload engine

- New module: `src/main/drive/driveUploadEngine.ts`, mirroring `copyEngine.ts`'s existing interface and `CopySummary` return shape, so `HomeScreen`'s Confirm button, progress UI, and done-screen all work unchanged regardless of destination type — only the button label changes ("Confirm & Copy" vs "Confirm & Upload").
- Per group:
  1. Find-or-create a Drive folder with the group's name under the root folder (`files.list` with a `name = 'X' and 'ROOT_ID' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false` query; create via `files.create` if not found).
  2. List that folder's existing children **once** (not once per file) to build a skip-set of already-uploaded filenames.
  3. For each file not in the skip-set, upload via Drive's **resumable upload** protocol (`uploadType=resumable`) — this lets a single large in-progress upload (e.g. a big video/RAW) itself resume mid-file after a connectivity blip, not just skip-if-fully-uploaded at file granularity.
- This satisfies the user's retry requirement: *"reuse folder and skip duplicates"* — re-running a copy session to Drive after a partial failure only uploads what's missing, without re-uploading already-successful files or creating duplicate folders.

### Pause/resume on connectivity loss

- The app is otherwise offline-first; only the Drive upload path needs to care about connectivity.
- Detected by catching network-level errors from the Drive API calls themselves (`ENOTFOUND`, `ETIMEDOUT`, etc.) rather than trusting `navigator.onLine` alone (unreliable — e.g. connected to a LAN with no real internet route).
- On a network error mid-upload: state transitions to `paused` (a new state, distinct from `error`). The in-flight file's resumable-upload session URL is kept so the same upload can continue rather than restarting from zero. Retries with exponential backoff while offline (e.g. 5s → 10s → 20s → capped at some max), or immediately on a renderer-forwarded `online` event.
- `CopyProgressEvent` (shared type) gains a `status: 'uploading' | 'paused' | 'done'` field.

### Progress/summary UI

- Reuses the existing `ProgressBar` component and the `subView === 'copying'` rendering in `HomeScreen.tsx`. Adds a distinct row/message when `copyProgress.status === 'paused'` (e.g. "Paused — waiting for connection…").
- The done screen (`subView === 'done'`) gains a "View in Drive" button (opens the root folder in the browser via `shell.openExternal`) alongside the existing "Open destination folder" button, which only makes sense for `destinationType === 'local'` and should be hidden/replaced accordingly.

### Error handling

- Auth failures (revoked access, refresh-token exchange failure) surface as a distinct "reconnect to Google Drive" prompt — not folded into the generic upload-error path, since the fix is different (re-auth, not retry).
- Per-file upload failures that aren't network-related (quota exceeded, invalid/corrupt file rejected by Drive) land in `CopySummary.errors`, same handling as today's local-copy errors.

### Out of scope for Checkpoint 1 (explicitly deferred)

- Sharing links (Checkpoint 4 / Drive Phase 2).
- Any Drive folder browsing/picking UI.
- Supporting Drive *and* local simultaneously in one copy session (it's one or the other, chosen via the toggle).

---

## Checkpoint 2: Full-screen lightbox + selection + delete/move/rename

### Architecture decision

Extend `useImportWorkflow`'s existing reducer with new actions (`OPEN_VIEWER`, `CLOSE_VIEWER`, `TOGGLE_SELECT`, `CLEAR_SELECTION`, `DELETE_FILES`, `MOVE_FILES`, `CREATE_GROUP`, `RENAME_FILE`) that mutate `state.groups` directly — the same pattern the existing `renameGroup` action already uses. This was chosen over two alternatives considered and rejected:

- A separate `SelectionContext` + promoting the lightbox to a third `App.tsx`-level screen: rejected because it'd duplicate "what files exist" bookkeeping across two state containers, risking drift between the grid and the viewer.
- Modeling deletes/moves/renames as a diff/edit-log layered on top of pristine analyze results (resolved only at Confirm & Copy time): rejected for now as unneeded complexity — there's no undo feature planned yet (see Backlog). If undo is picked up later, **this is the decision to revisit.**

All of delete/move/rename are **non-destructive to the source**: they only affect the in-memory `state.groups` (and therefore what gets copied/uploaded on Confirm), never the original files on the SD card/source folder. This matches the existing `renameGroup` behavior (which already only affects the group's display name, not source files) and was explicitly confirmed with the user for each action individually.

### Lightbox (viewer)

- New component, rendered as an overlay inside `HomeScreen` (not a new top-level `App.tsx` screen) when `state.viewerIndex` (an index into a flattened, ordered list of all files across all groups) is non-null.
- **Navigation order:** group order (top-to-bottom, as currently displayed), then timestamp within each group — i.e. exactly the order already on screen. Next/prev crosses group boundaries seamlessly (reaching the last photo of a group continues into the next group's first photo, all the way to the very last photo overall).
  - This ordering is deliberately just "whatever order the flattened file list is currently in." When Checkpoint 3 (drag-and-drop reorder) ships, reordering the same underlying array means lightbox navigation automatically respects the new order — no additional work needed here.
- Toolbar: **Select**, **Delete**, **Move** buttons, plus **Rename** (text input, likely inline or via a small dialog — final micro-UX TBD at implementation time). Standard viewer chrome: close (X / Escape), prev/next (arrows / ← →).
- **Move** moves file(s) to a different group within the current analyzed batch (not to a different folder on disk — that's Checkpoint 3's "move between folders" concept, kept separate). The move target picker lists existing groups plus a **"New group"** option that creates an empty group and drops the file(s) into it.
- Keyboard support and focus-visible styling follow the same accessibility pattern already established in V1.1 (aria-labels, brand-colored focus ring, keyboard operability) — this is not optional polish, it's how the rest of the app already works.

### Grid (thumbnail) selection

- Each thumbnail in `GroupCard`'s thumbnail row gets a checkbox that's visible on hover (not always-visible, to avoid cluttering the default view) and becomes persistently visible once any selection is active anywhere in the grid.
- Clicking a checkbox selects that file and puts the whole grid into "selection mode." Selection state (`Set<string>` of file paths, or similar) lives in the `useImportWorkflow` reducer, shared between the grid and the lightbox (opening the lightbox from a grid with an active selection should reflect/extend that same selection, not start a separate one).
- Bulk actions (Delete, Move) apply to the full selection, whether it was built via the grid or extended while browsing in the lightbox. **Rename stays single-file-only** — no batch rename UI in this checkpoint (renaming several files to one name doesn't make sense, and a pattern-based batch-rename feature is unscoped, not requested).

### Testing

- `useImportWorkflow`'s reducer currently has no dedicated unit tests (verified by lint/typecheck/existing test files only). This checkpoint's implementation plan should add reducer tests for the new actions, since the reducer is growing more complex and is easily testable in isolation (pure function, no IPC/Electron dependency).

---

## Checkpoint 3: Reorganize before copy (scoped at a high level only)

Not brainstormed in detail yet — revisit with a dedicated brainstorming session when this checkpoint is picked up. Known from the initial conversation:

- Drag-and-drop reordering of files (within a group, and/or across groups — TBD).
- Moving files between folders — needs clarification on whether "folders" here means groups (already covered by Checkpoint 2's Move) or an actual local/Drive folder-tree concept introduced fresh in this checkpoint.
- Creating and deleting folders — same ambiguity: virtual (staging) folders vs. real destination folders created ahead of the copy/upload step.

---

## Checkpoint 4: Share links (Drive Phase 2)

Not brainstormed in detail yet. Known from the initial conversation:

- One shareable link **per group folder** (not per individual photo) — confirmed with the user: friends open one link and see the whole batch, avoiding per-photo link-spam.
- Depends on Checkpoint 1 (Drive destination) being implemented first — needs Drive's `permissions.create` API (e.g. "anyone with the link can view") applied to each group folder, plus UI to trigger/copy the link, likely from the same done-screen where "View in Drive" already lives.

---

## Next steps

Implementation plans are written one checkpoint at a time (via `superpowers:writing-plans`), not all up front — starting with **Checkpoint 1 (Google Drive destination)**, since it's the MVP-priority item. Checkpoints 3 and 4 need their own brainstorming pass before a plan can be written for them; Checkpoints 1 and 2 are ready to move straight to planning whenever picked up.
