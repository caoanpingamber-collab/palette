# Isolated Online Admin Publication Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved integration and publication request. Update task checkboxes as verification completes.

**Goal:** Publish the existing administrator interface on the already authorized native backend, connect the existing detection site to online storage, and preserve the ordinary user interface.

**Architecture:** Native `/admin` serves one bundled page with a response CSP sandbox that omits `allow-same-origin`, pinned inline script, no framing and no persistence. Production private APIs accept only explicit bearer sessions; the token stays in the isolated page's module memory, never cookies, storage, URLs or messages. Private media is fetched with that token and displayed through revocable blob URLs. Public detection still uploads anonymously to the same cloud backend.

**Tech Stack:** Existing React/Vite, Express authentication/provider modules, Nest platform adapter, DataPaas and private FileService. No new provider, domain, paid resource or frontend copy.

**Spec:** Existing history requirements and the user's explicit request to integrate and publish. This plan replaces the earlier local-admin-only delivery assumption.

## Constraints and Review Focus

- Preserve the existing administrator password and all stored data.
- No ordinary-user login, new homepage controls, detector changes or shader edits.
- Published decorative backgrounds remain hidden; local backgrounds remain intact.
- Never treat opaque `Origin: null` as authorization; bearer checks protect every private response, and no credentialed CORS is enabled.
- The login form must fail closed if the browser did not apply the opaque-origin sandbox.
- Same-host opener/iframe attacks, cookie-only access, token leakage, logout/expiry, stale asynchronous blob results, and private downloads must have regression coverage.
- Existing cloud production request paths continue to use injected platform services, never CLI/development credentials.

## Task 1: Isolated Authentication and Page Contract

- [x] Add and run failing tests for bearer-only sessions, no Cookie fallback, CORS preflight, session/logout/expiry, CSP sandbox and script hash.
- [x] Implement an optional bearer transport without changing the local cookie contract.
- [x] Add a safe server-rendered admin HTML wrapper and generated single-file bundle contract.
- [x] Run focused and existing unit/API tests (56 passed after lifecycle/deletion regressions).

## Task 2: Existing UI and Private Media

- [x] Add failing client/browser tests for credential omission, memory-only bearer sessions and authenticated blob assets.
- [x] Adapt the existing history client and reuse the existing HistoryAdmin component in a separate build entry, not a project copy.
- [x] Embed existing branding assets in the standalone bundle to keep report canvases untainted.
- [x] Require the opaque-origin sandbox before rendering the login form, and redirect the existing site's admin route to the canonical secure page.
- [x] Verify login, image/video listing/detail/download, independent frame selection, logout, and same-origin attacker denial in isolated browser contexts (14 passed).

## Task 3: Native Deployment

- [x] Package only the canonical backend modules and generated admin bundle into the existing native backend checkout.
- [x] Enable production bearer mode and serve `/admin` with enforced CSP, COOP, no framing and no-store headers.
- [x] Review security findings; run native tests, typecheck and build; push only related backend changes to `sprint/default`.
- [x] Release through the official platform flow and wait for `finished` (final release `7703461419509042209`).
- [x] Verify live response headers, opaque browser origin, rejected cookie-only access, and synthetic private-media lifecycle. Never reset the real admin password for testing.

## Task 4: Existing Website and Local Connection

- [x] Build and publish the existing static frontend with the online API base, secure admin URL and decorative backgrounds disabled.
- [x] Validate real synthetic image/video detection and cloud readback through the published page, without archiving materials locally.
- [x] Point the existing local website's loopback proxy at the verified online backend; keep its background and UI intact.
- [x] Update handoff/docs with actual release URLs and remaining limits; do not claim the user's real password was exercised unless the user validates it.

## Primary References

- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin

The CORS warning about `null` origins is intentional here: authorization must never depend on that value. The design uses explicit bearer capability checks and omits ambient credentials; the sandbox protects the page's session memory, not the API's identity check.
