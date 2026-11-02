# Inspection History Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans and test-driven-development. Track progress below; preserve concurrent changes.

**Goal:** Anonymous detection archives originals and immutable result snapshots; an authenticated administrator can browse, replay, export, and delete them.

**Architecture:** Retain Vite/React and browser-side detection. Add an Express API, SQLite metadata and sessions, and private filesystem assets for local operation. Keep the API boundary explicit for later production storage migration; no deployment in this iteration.

**Tech Stack:** Node >=22.13 with node:sqlite, Express 5, busboy, cookie, file-type, zod; existing React and lucide UI; node:test and browser acceptance tests.

**Spec:** `docs/superpowers/specs/2026-10-29-inspection-history-design.md`, approved by user.

## Global Constraints

- Work in the existing palette-app directory; no copied project or new worktree.
- Preserve existing PatternRefraction, color.js and vite.config.js edits; do not change detection thresholds or background behavior.
- Anonymous public creation only; all reads, files and deletion require server authentication.
- Preserve originals, image/video result snapshots, and rule versions; no automatic expiry.
- Never publish, push, provision external storage, or upload user assets externally in this iteration.
- Leave changes uncommitted to avoid capturing another session's work.

## Review Focus

- Repeated submission IDs must not duplicate history or reveal someone else's record.
- Interrupted or rejected uploads must leave no partial records; storage exhaustion must not erase history.
- Expired sessions and cross-origin mutations must never expose or remove assets.
- Reopened video results must keep first/last metrics aligned while the original continues playing.
- A storage outage must not break browser detection or claim a record was saved.

## Files and Interfaces

- `server/store.mjs`: SQLite records/assets/admin/sessions, private disk lifecycle and quota.
- `server/auth.mjs`: password hashing, opaque sessions, CSRF and bounded in-memory local rate limiting.
- `server/schema.mjs`, `server/upload.mjs`: strict snapshot validation and bounded multipart/file validation.
- `server/app.mjs`, `server/index.mjs`: `createApp({store,...})`, same-origin API and local startup.
- `scripts/admin-create.mjs`, `scripts/dev.mjs`: local credential initialization and paired dev services.
- `src/lib/history.mjs`: `snapshotResult(result)`, `archiveInspection(file,result,id)`, `restoreResult(record)`, admin API helpers.
- `src/components/HistoryAdmin.jsx`, `HistoryAdmin.css`: login, filtered paginated list, private detail replay, download/report, confirmed deletion.
- `src/App.jsx`: archive once after detection, save status/retry and admin route/entry. Leave result rendering unchanged.
- `tests/history-api.test.mjs`, `tests/history-client.test.mjs`: real API/storage/auth and snapshot round trips.
- `package.json`, `.gitignore`, `vite.config.js`, `README.md`, `.env.example`: only the startup/proxy/dependency/private-data documentation necessary for this feature.

## Tasks

### 1. Persistence and authenticated API

- [x] Write real HTTP tests for anonymous create, protected reads/assets/deletes, login/CSRF/logout, idempotency, restart persistence, filters and quota rollback.
- [x] Run `node --test tests/history-api.test.mjs` and observe the missing feature fail.
- [x] Implement store/schema/upload/auth and `createApp`, using prepared SQLite statements and private generated asset names.
- [x] Run the full API suite; add malformed, oversize and truncated upload tests. Expect all pass and no incomplete archive.

### 2. Snapshot and frontend archive boundary

- [x] Write round-trip tests proving snapshots exclude DOM/data/blob URLs, preserve rule values and both video frames, and restore saved outcomes without reanalysis.
- [x] Observe the tests fail, implement `src/lib/history.mjs`, rerun both suites.
- [x] Add stable upload IDs and explicit save/retry states to App; closing a result never aborts or duplicates an already accepted archive.

### 3. Admin UI and local runtime

- [x] Write browser acceptance tests for login, upload/archive, filtering, private original replay, frame switching, export and deletion.
- [x] Observe missing UI fail; implement responsive admin UI using existing typography and lucide icons, with accessible forms, pending/error/empty states and pagination.
- [x] Add paired dev startup, same-origin proxy, interactive admin creation and production static serving. Ignore private data and document persistent disk requirements.
- [x] Verify desktop/mobile layout, source upload size restrictions, expired session handling and save failure/retry.

### 4. Final verification and review

- [x] Run `npm test` and `npm run build`; run browser acceptance against the actual local services.
- [x] Have a fresh reviewer check authorization, file lifecycle, video restoration, outage behavior and preservation of unrelated changes. Fix material findings with regression tests.
- [x] Start the local app on an available port; return the app/admin URLs, credential setup command and the explicit not-yet-deployed boundary.

## Execution Ledger

- Approved scope: local complete feature; no external upload or deployment; no automatic deletion.
- Ruling: implement inline in the existing dirty checkout and leave changes uncommitted, to preserve the user's concurrent work.
- Task 1 initial gate: API suite RED (missing server) -> GREEN 5/5; real SQLite and HTTP, no mocks. Additional upload and abuse coverage remains before final gate.
- Task 2: snapshot round-trip RED -> GREEN; no DOM/temporary media URLs stored; both video frames restored from private API URLs.
- Task 3: browser archive indicator RED -> GREEN; complete image workflow, retry and synthetic MP4 playback verified (3/3). Found and fixed busboy's exact parts-limit behavior and local-day date conversion with RED -> GREEN regression coverage.
- Additional guards: in-flight upload cap and unsafe data directory tests RED -> GREEN. Additional symlink and unowned-directory safety tests RED -> added canonical path/ownership guards before final validation.
- Final review: first reviewer filesystem read was blocked; the same reviewer then reviewed the complete line-numbered source supplied directly. Independent static review identified unhandled discarded-stream errors and deletion/retry resurrection, both reproduced RED. Reviewer did not independently run tests or inspect CSS/README.
- Final: Ruling: promote whole-body chunked cap and expired-download feedback from Minor to Important because they violate explicit request limits and the expected expired-session workflow; include both in the fix pass. Cost: one additional session check per download/export and one byte-count listener per upload.
- Final: own review reproduced account-setup/startup recovery deleting an in-progress commit; protect recovery with a SQLite writer transaction. RED worker test verified actual file loss before the fix.
- Final fixes: discarded-stream errors, deletion/retry tombstones, full-body size accounting, expired download/export authentication and recovery transaction each reproduced RED and now individually GREEN. Oversized-stream probe stops at the limit to observe HTTP 413 without writing into the intentionally closed connection.
- Review scope rulings: production deployment, distributed operation, power-loss guarantees and forensic erasure are outside this local iteration; no production-ready claim. Cost: deployment needs its own persistent-storage, backup and security checks.
- Dependency audit: existing toolchain advisories remain (including existing body-parser/Vite/shadcn/undici versions); no forced unrelated upgrades. New login JSON parsing disables compressed bodies. Resolve/assess outstanding advisories before any public release.
- Final gate: npm test 20/20, Playwright 5/5, production build exit 0, git diff --check clean. Real server 5190/5192 healthy; anonymous history HTTP 401 and direct private database HTTP 403. Temporary test services stopped.
- Manual CLI gate: hidden-password setup verified against an isolated temporary database; only a scrypt hash was stored. Test credentials/data removed. The real local administrator remains unconfigured until the user selects a password.
- Delivery: local app http://127.0.0.1:5190/ and admin /admin. Existing background/detection changes preserved; no commit, push, cloud provisioning or deployment.
- Follow-up: user explicitly rejected added frontend UI. Remove homepage entry/disclosure and result archive status/retry controls, retain silent archival and direct /admin. Browser regression first failed on the unwanted homepage entry; existing end-to-end tests now observe the archive response instead of requiring status UI.
- Storage follow-up: user rejected storing team originals on their computer. Default archival OFF; server rejects writes before upload parsing, frontend checks health before generating/uploading archive files. Existing credentials/data kept. Cloud/provider selection and actual remote storage integration remain unresolved; no external uploads or deployment. Isolated tests explicitly enable their temporary stores.
