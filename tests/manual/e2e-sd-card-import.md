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
