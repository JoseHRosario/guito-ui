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
means permanent `session_expired`; generic 502/503 means retryable
`temporarily_unavailable`. HTTP 503 `service_starting` is reserved for known
readiness exhaustion **before Google code exchange**, not arbitrary 503,
configuration or encryption-key failures. Failed establishment must not pretend persistence
when Google omitted renewal permission. No Google refresh token belongs in any
browser response/storage, URL, log or screenshot.

API prerequisites belong to the API release/runbook, not to UI provisioning:
per-environment DynamoDB session table and scoped IAM, credential encryption key
in the existing secret backend, allowed identity and OAuth configuration,
explicit trusted UI origins, public-at-edge cookie endpoints, their own
origin/header/content-type protections and credentialed CORS. Required cookie:
`__Host-guito-session`, HttpOnly, Secure, SameSite=Strict, Path=/, **no Domain**,
persistent Max-Age=604800 on success, with server-enforced idle expiry.
Staging and production use distinct API hosts/cookies and secrets. Missing
key/configuration must fail closed, never fall back to browser refresh tokens
or plaintext storage.

Review naming uses **user session**, not a new multi-user identity model.
José approved replacing the unmerged feature's Postgres session store with
DynamoDB: Standard tables in Ireland (`eu-west-1`), fixed provisioned **1 RCU /
1 WCU per table**, named `guito-api-user-sessions-staging` and
`guito-api-user-sessions`. Runtime access is scoped to GetItem, PutItem,
UpdateItem and DeleteItem on those tables; deployment provisioning and exact
readback belong to the paired API lane. The free-first capacity choice depends
on the account's shared allowance, not a promise of a zero AWS bill. No
session backup/autoscaling or paid extras are introduced.

The API retains encrypted refresh credentials in the existing AES-GCM envelope.
DynamoDB TTL is eventual cleanup only; server predicates enforce seven-day idle
expiry immediately. Login, renewal and logout must not access the financial
Data API or wake Aurora. Expense/Category/Bank requests still may wake Aurora.
There is no Postgres fallback, dual write or live credential import. José chose
**one fresh staging sign-in** at cutover. The unmerged SQL session migration is
removed on the API side; previously applied Postgres rows/tables and migration
ledger entries stay untouched. Their later cleanup requires separate approval.

`UserSessionEncryptionKey` remains canonical in the existing per-environment
SSM JSON payload. Staging's historical field rename was separately approved and
privately verified with the exact same key; it is no longer a pending gate and
was not rotation. This store switch needs no SSM/key mutation. Missing/invalid
canonical keys and old-only payloads fail closed. Production key setup and
production deployment remain separate owner gates. Shared-staging replacement
must remain within approved scope; rollback must not blindly restore Postgres
session acceptance because the stores do not share renewal/logout state.
No UI runtime or wire contract change is needed.
See the [API runbook](https://github.com/JoseHRosario/guito-api/blob/feature/156-persistent-login/docs/persistent-human-login.md).

Do not deploy just the UI against an old API and call persistent login working.
Do not use the legacy `/Auth/logout` as a compatibility fallback: it revokes the
shared Google grant and violates independent-device logout. Do not patch live
credentials or silently substitute a response when an endpoint is unavailable.

## Cold-start budgets and recovery

- Session HTTP only: **35s browser > 30s gateway/Lambda > 25s API overall**.
  API refresh cleanup has a separate **2s maximum**. The pre-code availability
  check is a non-mutating strongly consistent DynamoDB GetItem; there is no
  18s Aurora readiness loop on session paths and no SDK retry of uncertain
  session mutations. Unrelated financial deadlines remain unchanged at 15s.
  Logout still clears local state synchronously; its cookie cleanup is bounded
  best-effort with the session HTTP deadline.
- Compatibility handling remains: `service_starting` displays **Service starting / The service is starting.
  Please try again.** on the existing error card. The UI does not automatically
  resend any Google code. A deliberate retry may reuse the pending callback
  only after this explicit readiness-gated API failure; returnUrl/PKCE survive.
  A shared `guito.auth.exchange` marker records only the login epoch, OAuth
  state and outcome (`attempted` or `manual-retry-required`), never code/verifier
  or tokens. It is read/written inside the session Web Lock, including readiness
  classification before releasing the lock. Callback reloads and copied tabs
  render the startup card without exchanging; only an explicit **Try again**
  authorizes a recorded readiness rejection's next exchange. Unknown failures
  remain blocked across tabs/reloads; a fresh Google login creates a new epoch.
- Generic HTTP errors, malformed success, connectivity or browser timeout do
  **not** establish whether Google consumed the code. The shared attempt guard
  blocks even a copied tab carrying an older pending PKCE record;
  the next user retry starts Google again, retaining only the requested route.
  Popup exchange failures reuse the same callback card without another exchange
  on entry. Its `sessionError` query marker selects copy, not code-reuse safety.
- Browser deadline copy says **timed out / service may be unavailable**;
  actual network/CORS rejection keeps connectivity wording. Renewal's original
  error reaches the existing card/feature error region, without forced signout.
  The server's definitive renewal 401 still clears the expired session and
  routes to Google with the correct returnUrl. No drafts or financial replay.
- **Historical Postgres-backed incident (before the 2026-10-19 store decision):**
  staging showed Google success followed by endpoint 503 after
  16.295s, then a subsequent 740ms success. The old 15s browser deadline was
  shorter than the 25s API budget. Aurora min=0 alone does not prove the original
  failure was a database exception; no such underlying exception was logged.
- Local clocks/control responses prove delayed (>15s) success, deadline copy,
  explicit retry and no replay. Playwright substitutes only the
  `AbortSignal.timeout` timer source so its clock controls the deadline; native
  AbortController and fetch remain in use. Exact 34,999/35,000ms boundary checks
  use unit fake timers. No test sleeps for a real 35s timeout.

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

### 2026-10-19 documentation-only DynamoDB alignment

- Application and spec TypeScript checks passed (`--noEmit`); tokens regenerated
  without a tracked source change.
- Production and staging builds passed: **512.46 kB** initial bundle each,
  **12.46 kB** above the unchanged 500 kB warning budget.
- Full Angular unit suite: **39 files, 436 tests passed**. The existing jsdom
  diagnostic `Not implemented: navigation to another Document` remains.
- Full production and staging built Chromium suites each: **85 passed, 1 skipped**
  (live-only deployed smoke), four workers, no retries or failures.
- Angular/runtime, tests, configuration, dependencies and version are unchanged.
  These hermetic UI checks do not verify live DynamoDB or owner Android gates.

### Earlier UI implementation evidence — retained history

- Application and spec TypeScript checks passed (`--noEmit`).
- Token generation passed without token-source changes.
- Full Angular unit suite: **39 files, 436 tests passed**.
- Production built Chromium suite: **83 passed, 1 skipped** (the live-only
  deployed-smoke gate, intentionally not enabled).
- Staging built Chromium suite: **83 passed, 1 skipped**, same live-only gate.
- Popup handoff stress regression: **20/20 passed** with four workers after
  fixing the callback-close/queued-message race. No retries hid a failing run.
- Additional cold-auth browser repetition: **27/27 passed** (nine scenarios,
  three repetitions, four workers), without retries.
- Both builds passed, with initial bundle warnings: production **512.09 kB**
  (**12.09 kB** above the 500 kB warning budget), staging **512.10 kB**
  (**12.10 kB** above). No budget was raised and no dependency added.

These figures are retained evidence from the earlier UI implementation, not a
DynamoDB deployment check. None of the
live acceptance gates below has been performed by these checks.

Cold-start TDD evidence: delayed exchange/refresh tests first failed because
the 15s signal aborted; after the 35s budget they passed. Exact-deadline tests
then failed on the old connectivity wording and passed with timeout copy.
Explicit startup renewal, uncertain-code replay prevention, rendered retry/route
restoration and popup failure handoff each had observed failing tests before
their implementation. Final full suites include all these regressions, native
Web Locks/logout races and the unchanged no-financial-replay scenarios.

## Owner-approved live staging acceptance — NOT performed locally

1. Review exact paired UI/API commits, staging deployment provenance, DynamoDB
   table settings/TTL/scoped IAM, canonical API key configuration and explicit UI
   origins. Confirm shared-staging replacement remains within José's approved
   scope; production is not approved. Branch pushes auto-deploy
   staging: a local source commit is **not** permission to push.
2. Use the real approved staging UI and Google account. Confirm one fresh
   identity-only offline consent and a successful session exchange after cutover;
   do not migrate live Postgres credentials. Inspect
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

8. **Aurora-independent session / installed Android acceptance NOT performed:**
   with approved paired staging deployments/configuration, confirm fresh Google
   callback, renewal and logout succeed without waking or waiting for Aurora.
   Correlate sanitized API stages/timings and exact DynamoDB configuration;
   subsequent Expense/Category/Bank reads may still resume Aurora. Do not change
   financial data to induce coldness or use a financial write as an auth test.
   Generic 503 must not masquerade as `service_starting`. Local stubbed tests
   do not establish live DynamoDB conditions, real Google one-use behavior,
   cookies on Android or deployment readiness.

Production rollout and genuine Android owner acceptance are separate gates.
Provider revocation/refresh-token limits can still require a fresh login. A
failed/offline logout cannot revoke the remote session immediately; its local
signed-out marker prevents automatic resurrection on this browser, and existing
Google ID tokens can remain valid until expiry. Never promise global Google
sign-out or instantaneous invalidation of copied ID tokens.
