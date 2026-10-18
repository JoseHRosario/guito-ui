# Persistent user login — local verification and live gates

Companion to [ADR 0016](adr/0016-persistent-user-login.md) and
[API issue #156](https://github.com/JoseHRosario/guito-api/issues/156).
UI version: **0.12.0**. This document describes source behavior and acceptance
requirements; it is not a deployed-status claim.

## Wire and release prerequisites

The paired API must implement the exact browser contract:

| Endpoint | Request | Successful response |
| --- | --- | --- |
| `POST /Auth/session/token` | `{code, codeVerifier, redirectUri}` | `{idToken, accessToken, expiresIn, sessionExpiresAt}` |
| `POST /Auth/session/refresh` | `{}` | Same token response |
| `POST /Auth/session/logout` | `{}` | 204, including missing/expired sessions |

Every request uses JSON, includes credentials and `X-Guito-Session: 1`.
`expiresIn` is seconds; `sessionExpiresAt` is a UTC ISO timestamp. Renewal 401
means permanent `session_expired`; 502/503 means retryable
`temporarily_unavailable`. Failed establishment must not pretend persistence
when Google omitted renewal permission. No Google refresh token belongs in any
browser response/storage, URL, log or screenshot.

API prerequisites belong to the API release/runbook, not to UI provisioning:
server-side user-session schema/migration, per-environment credential encryption key
in the existing secret backend, allowed identity and OAuth configuration,
explicit trusted UI origins, public-at-edge cookie endpoints, their own
origin/header/content-type protections and credentialed CORS. Required cookie:
`__Host-guito-session`, HttpOnly, Secure, SameSite=Strict, Path=/, **no Domain**,
persistent Max-Age=604800 on success, with server-enforced idle expiry.
Staging and production use distinct API hosts/cookies and secrets. Missing
key/configuration must fail closed, never fall back to browser refresh tokens
or plaintext storage.

Review naming uses **user session**, not a new multi-user identity model. The
paired API follows José's one-migration decision for the unmerged feature:
`011_user_sessions.sql` directly creates `user_sessions` and its expiry index with
`IF NOT EXISTS`; there is no rename migration. Staging's historical 011/012 ledger
entries may stay. Its already-renamed table needs no drop if the schema/indexes
match; the new filename runs harmless CREATE statements and is then recorded.
Existing-schema mismatch is not repaired automatically: pause for José's manual
cleanup decision, never delete ledger entries or drop tables as part of deployment.
The API now requires only `UserSessionEncryptionKey`, deserialized from the existing
SSM JSON payload; missing/invalid canonical keys and old-only payloads fail closed.
Before pushing/deploying the paired API source, José must separately approve
renaming staging's historical `HumanSessionEncryptionKey` JSON field to
`UserSessionEncryptionKey`, preserving its exact value and all unrelated fields
and settings, removing the old field and privately verifying readback. This is not
key rotation. Shared-staging replacement approval and deployed/rollback consumer
compatibility remain required. No live credential operation is performed by this
source/doc change, and no UI runtime or wire contract change is needed.
See the [API runbook](https://github.com/JoseHRosario/guito-api/blob/feature/156-persistent-login/docs/persistent-human-login.md).

Do not deploy just the UI against an old API and call persistent login working.
Do not use the legacy `/Auth/logout` as a compatibility fallback: it revokes the
shared Google grant and violates independent-device logout. Do not patch live
credentials or silently substitute a response when an endpoint is unavailable.

## Hermetic local checks

Use the owned issue worktree. Dependencies may be borrowed from an ignored
absolute `node_modules` symlink; no new dependencies are required.

```sh
npx tsc --noEmit -p tsconfig.app.json
npx tsc --noEmit -p tsconfig.spec.json
npm run tokens
npm test -- --watch=false
npm run build -- --configuration production
npx playwright test --workers=4
npm run build -- --configuration staging
npx playwright test --workers=4
```

Playwright's configured SPA server serves the configuration most recently
built. Do not run bare Vitest or substitute an ng-serve build for built-browser
acceptance. No SMOKE_URL, live auth, AWS or real Expense writes are needed.

The persistent-login browser scenarios include expired cache bootstrap and
reopen, retryable bootstrap/foreground failures, route restoration after
permanent expiry, legacy migration, no draft after genuine reauthentication,
cross-tab login/logout, native cross-tab renewal singleflight, logout during
renewal, offline logout/reload, and a single financial POST despite a 401 or
500 response. Auth HTTP specs additionally assert credentialed session calls,
dual ID-token headers, safe origin matching and pre-request renewal without
replay. The native two-origin CORS test now includes the credentialed session
refresh header and explicit allow-origin/allow-credentials, while retaining the
negative old-header business preflight probe.

## Verified local source evidence

- Application and spec TypeScript checks passed (`--noEmit`).
- Token generation passed without token-source changes.
- Full Angular unit suite: **38 files, 412 tests passed**.
- Production built Chromium suite: **74 passed, 1 skipped** (the live-only
  deployed-smoke gate, intentionally not enabled).
- Staging built Chromium suite: **74 passed, 1 skipped**, same live-only gate.
- Popup handoff stress regression: **20/20 passed** with four workers after
  fixing the callback-close/queued-message race. No retries hid a failing run.
- Both builds passed, with an initial bundle warning: **508.13 kB**, **8.13 kB**
  above the 500 kB warning budget. No budget was raised and no dependency added.

These figures are local hermetic evidence for this source change. None of the
live acceptance gates below has been performed by these checks.

## Owner-approved live staging acceptance — NOT performed locally

1. Review exact paired UI/API commits, staging deployment provenance, migration,
   API key configuration and explicit UI origins. Provisioning and replacing
   shared staging each require owner approval. Branch pushes auto-deploy
   staging: a local source commit is **not** permission to push.
2. Use the real approved staging UI and Google account. Confirm one fresh
   identity-only offline consent and a successful session exchange. Inspect
   cookie **attributes**, not token contents. JavaScript must not read the
   HttpOnly handle; no Google refresh credential is exposed.
3. Confirm native browser OPTIONS allows the exact UI origin,
   `Access-Control-Allow-Credentials: true`, POST and `X-Guito-Session`;
   untrusted/missing-origin mutations and wrong/missing session headers fail.
   Keep business dual-ID-token validation unchanged.
4. Wait for ID-token expiry or use an explicitly approved staging-only clock
   fixture. Close/reopen, discard/restart the installed Android home-screen
   app and restart the phone. Confirm restoration to the requested route,
   renewed business headers, and durable server state. Desktop viewport or
   fabricated cookie evidence cannot establish this OS lifecycle behavior.
5. Exercise two browsers/devices independently. Sign out one (also with an
   expired ID token): its cookie/session is revoked, sibling tabs follow, the
   other device and Google remain signed in. Check Back/bfcache and reopen.
6. With approved controlled failure injection, verify temporary network/provider
   failures retain the persistent session and present Retry. Verify recovery
   does not replay any Expense/Bank write. Definitive revocation/seven-day idle
   expiry asks for login, restores only the route, and loses unsaved fields.
   Do not change real financial data solely to demonstrate authentication.
7. Confirm meaningful successful foreground use extends server idle expiry;
   backgrounding/abandonment does not keep it alive. Test the exact seven-day
   boundary on the server with controlled time; do not fake a week of Android
   acceptance by editing browser token expiry.

Production rollout and genuine Android owner acceptance are separate gates.
Provider revocation/refresh-token limits can still require a fresh login. A
failed/offline logout cannot revoke the remote session immediately; its local
signed-out marker prevents automatic resurrection on this browser, and existing
Google ID tokens can remain valid until expiry. Never promise global Google
sign-out or instantaneous invalidation of copied ID tokens.
