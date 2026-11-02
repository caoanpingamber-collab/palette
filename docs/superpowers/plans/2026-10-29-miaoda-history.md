# Miaoda History Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the current website's history API to the approved Miaoda resource without changing its frontend.

**Architecture:** Keep the current same-origin API and administrator login contract. Store inspection records, administrator metadata, and sessions in the app-scoped cloud database; store media in the private object bucket. The native backend uses platform-injected DataPaas and FileService services. The local website will proxy that same deployed backend without storing materials or requiring development credentials at runtime. CLI access remains operator-only.

**Scope Revision:** The user explicitly requested updating the existing published site as well as the local website. Reuse frontend `app_179khnx30sk`; deploy backend `app_17h055cggnm`. Do not purchase a plan or claim free capacity. Do not publish the frontend until live cloud tests succeed.

**Tech Stack:** Existing Express/React, Miaoda PostgreSQL SQL gateway, official FileService and HTTP client SDKs.

**Spec:** `docs/superpowers/specs/2026-10-29-inspection-history-design.md`, updated by the user's explicit request to connect Miaoda storage.

## Global Constraints

- Canonical frontend stays in the existing project; no duplicate frontend, UI changes, login for colleagues, shader changes, or algorithm changes.
- Resource: `app_17h055cggnm`, development and online environments. Publication is authorized; purchasing a plan is not.
- Cloud errors must never fall back to filesystem archival.
- Preserve the existing administrator username/password by migrating its hash through the authorized private channel; never log credentials.
- Preserve existing local data; if local archives exist, stop for an explicit migration rather than hiding or deleting them.
- Credentials remain server-side under the denied/ignored private directory.
- Storage quota and charges are not established; the application cap is not a provider allowance or cost guarantee.

## Review Focus

- Concurrent submissions must not exceed the application cap or upload duplicate objects.
- An uncertain cloud commit must not erase files belonging to a committed record.
- Deletion must be retryable and must prevent late uploads restoring records.
- Async provider errors must retain authentication, CSRF, range, and no-store behavior.
- Missing/expired credentials must fail closed without enabling local media writes.

### Task 1: Async API and Provider Contract
- [x] Add failing tests for an asynchronous history and authentication provider.
- [x] Adapt API/authentication to await the provider, preserving local tests.
- [x] Add protected in-memory media responses with byte-range support.

### Task 2: Cloud Persistence
- [x] Add failing cloud-store tests for retries, quota, cleanup, and deletion.
- [x] Implement a testable cloud archive coordinator, SQL repository, and private object adapter.
- [x] Initialize app-scoped tables through the official SQL gateway, with atomic quota reservations and deletion tombstones.
- [x] Test real development database and object operations using synthetic materials only.

### Task 3: Connect and Verify
- [x] Add explicit provider configuration and a development-only startup guard.
- [x] Migrate the existing administrator hash only if the cloud has no account.
- [ ] Enable the current local website's cloud provider after smoke tests pass.
- [x] Run the full unit/API suite, browser suite, build, and source review; fix three late-upload/auth/runtime findings and rerun regressions.
- [ ] Verify protected downloads and zero new local archive files, then document deployment boundaries.

### Task 4: Authorized Publication
- [x] Deploy the native platform backend and migrate the online schema and existing administrator hash.
- [x] Match the existing site's anonymous access and block unrelated platform forwarder endpoints.
- [x] Add local streaming-proxy cookie, origin, CSRF and redirect regressions.
- [x] Replace opaque multi-statement runtime results with SDK transactions and parameterized statements.
- [ ] Complete published backend image/private-download/range/delete smoke tests.
- [ ] Publish the existing HTML app and verify real image/video upload and administrator readback in a fresh browser context.
- [ ] Point the local website at the verified online backend, preserving its background and frontend UI.
