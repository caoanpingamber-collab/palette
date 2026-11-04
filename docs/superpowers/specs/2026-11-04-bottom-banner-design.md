# Bottom Banner Inspection Design

Status: Approved scope with the user's explicit exclusion of font and font-size detection. Implement inline in the existing checkout; no project copy or deployment.

## Intent and Source of Truth

Add Bottom Banner inspection to the existing React/Vite Banner checker. Reuse the existing left-hand phone preview, right-hand result rows, markers, recommendations and exports. Rules must come from the new Bottom Banner specification, not from Header thresholds.

- UI: Figma file `CNW03KTHyOqcL9A4jKMWmC`, node `58:921`.
- Rules: same file, node `323:2592`.
- Inspected full-fidelity children: `323:2605` (title only), `323:2594` (title/subtitle), `323:2628` (visual crop), `323:2701` (full phone preview).
- Figma session: `08e5d8a8-ca34-47bb-988d-352ca7320899`.
- The rules are authored visual/copy/layout requirements. They do not define Header cold-hue, chroma, card contrast or clutter thresholds for Bottom Banner.

## Confirmed Requirements

### Home

Use the existing two-tab control: Header Banner and Bottom banner. The latter replaces the current unimplemented Mini-tool placeholder, matching the supplied design rather than introducing another tab.

Bottom mode copy:

- Heading: `Bottom banner detection`.
- Subtitle: `Upload a 1071*180 banner material`.
- Upload label: `上传banner`.
- Limit hint: `GIF图大小不超过500kb`.

Keep existing dimensions, spacing, typography, upload interaction, background implementation and responsive conventions. Preserve the selected mode through results, close, paste and drag/drop; never accidentally run Header analysis for a Bottom upload.

### Asset and Copy Rules

- Canvas: exactly 1071 x 180 pixels.
- GIF: at most 500000 bytes, consistent with the existing decimal KB convention.
- Title-only English layout: no more than 57 characters and two lines; Figma text box x=80, y=32, width=659, height=115.
- Title/subtitle English layout: title <=28 characters, subtitle <=48 characters, one line each; Figma title box x=90, y=39, width=684, height=53, subtitle x=90, y=107, width=648, height=34.
- Title: TikTok Sans Display Bold Oblique, 48px. Subtitle: TikTok Sans Text Bold, 28px, white at 80% opacity. Fonts, sizes and positions must not be casually changed.
- Main visual must appear on the right, centered in the circular thumbnail area.
- The circle is 180px diameter, x=770, y=0, center=(860,90), right edge at950, leaving121px to the1071px canvas edge.
- Thumbnail preview must crop that exact circle, not object-fit center the whole banner or resize its aspect ratio.

## Approved Detection Boundary

The supplied input is an already composed bitmap/GIF, not editable text layers. Proposed behavior:

1. Use browser-local OCR to estimate English text, line count and text bounding boxes. No external OCR upload or new paid service.
2. Count spaces and punctuation, normalize OCR whitespace, and do not count line separators as characters. Apply the English limits only when the detected script is compatible.
3. Show low-confidence, unreadable or unsupported-language text as `需人工复核`, never an automatic pass, a fabricated zero-character result or a definite failure based on missing evidence.
4. User explicitly excluded font and font-size detection. Do not create checks, manual-review rows, blocking conditions or report findings for either. The authored font references above are context only, not inspected rules.
5. Detect visual saliency within the right-side visual region, excluding text. Report the estimated subject center in banner coordinates, circle membership and distance to (860,90). If no reliable subject is found, require review rather than substituting a default center.
6. Figma gives no numeric tolerance for how close to the center counts as centered. Do not invent a Figma-authored percentage or coverage threshold. Circle containment is automatable; the precise centering requirement remains review evidence unless the user supplies a tolerance.

The user resolved the outstanding builder-check question: omit font and font size altogether. OCR uncertainty remains an explicit review state, not automatic success.

## Implementation Defaults to Confirm With the Description

- Keep static PNG/JPEG/WebP support for working/reviewing designs; cap Bottom inputs at500000 bytes. GIF is the authored animated format. Do not silently add MP4 to this Bottom workflow.
- Reuse an established GIF decoder rather than write GIF parsing/compositing. Inspect first and last composited frames as in the existing video workflow; label this sampling accurately, not as an all-frame guarantee. Preserve the original GIF looping in the preview while switching the analysis-frame results.
- OCR/GIF processing is lazy, local and bounded. No perpetual OCR, extra animation loop, polling or unbounded GIF decompression. Failures leave the checker usable and surface a truthful review/error result.
- Use the same phone dimensions and result-panel styling as the existing experience; provide two Bottom preview positions: complete pill banner and exact circular thumbnail. Map each issue marker from its actual banner/text/subject coordinate into the displayed preview, not arbitrary Header marker targets.
- Use the fixed CapCut phone content/assets from the Figma preview. Uploaded banner remains dynamic. Do not use a screenshot of the entire design as the implementation.
- Do not change the current decorative shader to satisfy generated tool boilerplate. Background changes are outside the user's requested preview/result/detection scope.

## Result Model and Persistence

Keep Header result semantics and the existing `color.js` detector unchanged. Add a dedicated Bottom rule definition/analyzer and an explicit inspection mode carried through the result, report and history snapshot.

Bottom rows cover file/canvas, copy length, line count, text position, visual circle and thumbnail crop. There is no typography check. Distinguish pass/fail/review. A pending review must not produce `Approved` or be indistinguishable from a measured failure.

Current server snapshot v1 requires exactly the five Header keys, Header metrics and a300000-byte image limit. Introduce a validated Bottom snapshot version rather than weakening v1 or fabricating Header metric values. Retain v1 read/upload compatibility. Save the actual rule version, applicable constants, frame-specific checks and evidence, and restore Bottom previews without rerunning current rules over old records.

GIF originals remain image/gif private objects. Animated frame metadata and first/last assets must have an explicit validated contract so that treating them as either ordinary static images or MP4s cannot bypass size/type/asset validation. Admin original download and rendering must retain the GIF, not substitute a rasterized frame.

No database DDL is expected: existing storage uses JSON rule/result snapshots and image media kinds. Any necessary server validator or administrator bundle changes still require packaging, native runtime checks and a separately authorized publication before online support can be claimed.

## Non-Goals and Guardrails

- No project copy or new worktree. Work in the existing project and preserve other sessions' changes.
- No changes to current Header thresholds, visual-center repairs, preview scaling, marker label sides, video looping or20px footer placement.
- No homepage history/status/login controls. Archive silently and non-blockingly, with no fallback to local material storage.
- No administrator credential reset, auth weakening, new domains/providers or paid resource activation.
- No automatic source push or deployment is assumed from this feature request. Confirm delivery scope after the local implementation; report any unshipped online contract plainly.

## Acceptance and Verification

- Header checks/results/preview/video/history regressions remain passing.
- Switching tabs, upload, paste, close and reupload consistently preserve Bottom mode.
- Correct and incorrect dimensions/byte boundaries yield accurate results without stretching the original.
- Test English character limits57/28/48, one/two/three lines, multiple layouts, uncertain OCR, missing text and unsupported scripts.
- Test exact circle crop coordinates and estimated marker positions with synthetic subjects inside/outside the circle; no default or drifting visual center.
- GIF remains moving; decoded first/last outcomes and compositing are correct, distinct and safely bounded.
- Preview arrows, original/preview downloads and report export work across desktop/mobile without overflow or clipping.
- Snapshot v1 remains accepted; Bottom version validates file type, bounds, frame count, rule keys and overall pass/review/fail consistency. Round-trip preserves the actual rule and manual-review evidence.
- Local tests use synthetic assets and isolated servers. Do not send test materials from the user's real workflow to online history or use actual Chrome screenshots.
- Build and run the existing local website, keeping the requested background. No claims of live publication based only on a local build or API health.
