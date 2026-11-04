# Bottom Banner Inspection Implementation Plan

Historical implementation milestone. The user's later GitHub/publication request is recorded in `2026-11-04-bottom-banner-publication.md`; that document supersedes the local-only publication boundary below.

> **For agentic workers:** Use superpowers:executing-plans and test-driven-development inline. User requires the existing checkout; do not create a worktree or project copy. Final whole-change review is read-only.

**Goal:** Add the approved Bottom Banner mode with independent Figma rules, matching existing preview/results and supporting safe history snapshots.

**Architecture:** Dedicated pure Bottom rules and geometry, bounded browser-local OCR/GIF adapters, shared existing results shell with a Bottom phone preview. Version2 snapshots preserve Bottom evidence and animated-image frames without changing Header version1 behavior. No font/font-size detection.

**Tech Stack:** Existing React/Vite, Node test runner, Playwright, gifuct-js, browser-local Tesseract.js worker.

**Spec:** `docs/superpowers/specs/2026-11-04-bottom-banner-design.md`.

## Global Constraints

- 1071x180; maximum500000 bytes; English57 title-only or28 title+48 subtitle characters; at most2 lines.
- Crop circle x770,y0,180x180, center860,90. Do not claim an unprovided centering tolerance.
- No fonts or font-size findings. Uncertain OCR/subject detection yields review, not fabricated success.
- Preserve Header detector, shader, silent cloud-only archive and current administrator credentials.
- GIF keeps playing while first/last composited analysis results switch. Bound frame count and decoded work before decompression.
- Local implementation only; no native release, GitHub push or cloud test writes without separate authorization.

## Review Focus

- Late OCR/GIF work after closing/reupload must not replace current state or leak workers/object URLs (Task2/3).
- Unsupported/missing OCR must not make empty text pass; mixed layouts and excessive lines must be classified correctly (Task1/2).
- GIF patch disposal2/3 and malformed/oversized frame metadata must not corrupt snapshots or allocate unbounded memory (Task2).
- Restored v1 Header histories retain old semantics; v2 Bottom image/GIF frames and file limits must be validated without broadening v1 (Task4).
- Desktop/mobile preview, marker coordinates and export wrapping must preserve aspect ratio, avoid overflow and match the exact circle crop (Task3/5).

## Task1: Independent Rules and Geometry [Complete]

**Files:** create `src/lib/bottomRules.mjs`, `tests/bottom-rules.test.mjs`.

**Interfaces:** `BOTTOM_RULES`, `evaluateBottom({width,height,bytes,ocr,visual})`, `findBottomVisual(imageData)`, `bottomPreviewPoint(point,variant)`; produce row pass/review/fail evidence and overall status, never Header thresholds.

- [x] Write failing tests for size/bytes boundaries,57/28/48 counts, line/layout/position classification, OCR uncertainty, subject circle coordinates and missing evidence.
- [x] Run `node --test tests/bottom-rules.test.mjs`; confirm the missing-feature failure.
- [x] Implement the bounded rules and main-component saliency geometry, explicitly reporting inferred evidence.
- [x] Re-run focused tests green.

## Task2: Browser OCR and GIF Input [Complete]

**Files:** create `src/lib/bottomMedia.js`, `tests/bottom-media.browser.mjs`; update dependency lock/package and local OCR assets.

**Interfaces:** `analyzeBottomFile(file,{signal})` produces an inspection result with `inspectionType:'bottom'`, `animated`, source GIF URL and frame snapshots; `recognizeBottomText(canvas,signal)` returns text lines/bounds/confidence. Worker and media URLs have explicit cleanup.

- [x] Add failing browser tests covering real English OCR and GIF compositing/first-last differences/limits.
- [x] Use pinned established OCR/GIF libraries. Ship worker/core/model locally; no external OCR upload, language CDN request or persistent pixel logging.
- [x] Decode sequentially with disposal handling and bounds checks; OCR only the bounded sampled frames, terminate worker after the job.
- [x] Run focused browser tests green and verify worker/model load from the application's base path.

## Task3: Existing Home and Result Experience [Complete]

**Files:** modify `src/App.jsx`, `src/components/ResultPage.jsx`; create `src/components/BottomPreview.jsx` and its scoped stylesheet; reuse original Figma assets where exact matches exist, fetch new static slots through official Figma asset output.

**Interfaces:** selected mode persists in App; `BottomPreview({src,variant,frame})` renders full/circle states and maps actual issue anchors; shared result rows recognize review status and do not show Header configuration-color controls for Bottom.

- [x] Add failing browser assertions for Bottom tab/copy, mode retention, no font rows, pass/fail/review state, preview arrows and responsive geometry.
- [x] Wire Bottom uploads without changing `color.js`, Header acceptance or video behavior.
- [x] Implement the375x812.977 Figma phone scaled into the existing320x694 stage, with full banner at7,655.429,360.5x60.588 and circle at308,667,59.16x59.16; preserve uploaded aspect ratio and crop.
- [x] Verify failure markers use true text/subject coordinates; frame switching keeps original GIF animation.
- [x] Re-run focused and existing browser checks.

## Task4: Versioned History Contract [Complete Locally]

**Files:** modify `src/lib/history.mjs`, `server/schema.mjs`, `server/upload.mjs`, `src/components/HistoryAdmin.jsx`; add `tests/bottom-history.test.mjs` and extend existing browser fixtures.

**Interfaces:** retain v1 Header schema exactly; v2 Bottom carries mode/rule constants, status/evidence, `animated` and validated first/last snapshots. Actual GIF remains original image/gif. No new database columns.

- [x] Add failing static/GIF v2 round-trip and validation tests, including rejection of mismatched types/counts/statuses/limits and v1 regression.
- [x] Add v2 schema/client/upload handling with per-version file-size limits and proper asset requirements.
- [x] Restore Bottom results, review statuses, looping originals and immutable rule snapshots in admin.
- [x] Run all unit/API tests; state clearly that remote native deployment is not updated in this local task.

## Task5: Reports, QA and Delivery [Complete Locally]

**Files:** modify `src/lib/report.js`; add/extend Bottom browser tests and update `DELIVERY.md` with local-only status.

- [x] Add failing report/preview-download tests: new rules rather than Header metrics, long detail wrapping, review state, circle crop and original GIF preservation.
- [x] Reuse the report visual language with Bottom-appropriate metrics and calculated height; do not render Header palette/configuration fields.
- [x] Run `npm test`, `npm run build`, `npm run build:admin`, `npm run test:e2e`.
- [x] Inspect desktop/mobile Playwright screenshots and image/pixel geometry; review all changes with one read-only reviewer, fix important findings with regression tests.
- [x] Keep or start the existing local server; give the user its URL and accurate remaining online-publication boundary.

## Execution Ledger

- Initial baseline: existing main clean except this feature's draft spec; user explicitly excluded typography detection.
- Ruling: work inline in the original checkout, not a worktree, per the user's existing-project requirement. Keep feature changes uncommitted/unpublished for review unless user asks otherwise.
- Ruling: use decimal KB as already used by Header. GIF first/last sampling is labeled, not claimed as whole-animation validation.
- Ruling: unknown exact centering tolerance is shown as center-offset evidence, with circle membership as the hard geometric rule; do not invent numeric Figma requirements.
- Review: one read-only whole-change reviewer identified seven issues. Regression tests reproduced and fixes addressed excluded out-of-zone OCR, GIF transparency/partial-first compositing, server patch bounds, failed/aborted worker initialization, ambiguous copy layout, text masked from saliency and line-separator character counts.
- Visual QA: reopened Figma phone323:2701; corrected the exported tools region to its375x370 intrinsic ratio rather than the larger source layout bounds. Fixed SVG foreignObject taint in preview canvas via verbatim same-origin SVG data sources; full/circle previews and reports download successfully.
- Verification:77 unit/API tests and29 browser tests passed; frontend and isolated-admin builds succeeded. Header color.js SHA256 remains2c2c789100728bcd98170e0f76be987eb1b6f96541d733c6323bb79b71f310ff. Existing GSAP empty-target warnings remain non-blocking; no background edits were made.
- Test isolation: synthetic Bottom records are removed from the temporary test server, preserving the existing suite's empty-list expectations. No cloud writes, credentials access, native checkout changes, Git commits, push or releases occurred.
- Publication boundary: native runtime still advertises onlyv1. A later authorized publication must install gifuct-js2.1.2 in the native checkout, package current server/admin, validate and publish it, then verifyv2 capability and publish/accept the frontend under its real base path.
- Follow-up OCR regression: a supplied1071x180 transparent rounded PNG exposed a48.3-confidence result because white-composited corners and right-side artwork were included as text. Background-matched OCR-only compositing, sparse segmentation and word-level bounds now recover two title lines totaling44 characters at95+ confidence without lowering the70 threshold or cropping away left/top/bottom misplaced text. Original assets remain unchanged and outside the repository; an optionalBOTTOM_OCR_SAMPLE path runs the same regression against a local sample. Updated verification:77 unit/API and30 browser tests passed.
