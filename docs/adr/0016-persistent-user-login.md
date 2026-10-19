# 0016 — Persistent user login (guito-api#156)

## Decision

The API owns an independent browser/device **user session** with a rolling seven-day
inactivity expiry, without an additional fixed maximum. Google ID-token
validation on business routes is unchanged. The session cookie is **not**
business authentication; the UI continues sending the same ID token in both
`Authorization: Bearer` and `x-google-idtoken`.

The UI uses `POST /Auth/session/token`, `/Auth/session/refresh` and
`/Auth/session/logout`, with JSON, `credentials: include` and
`X-Guito-Session: 1`. It never calls the legacy grant-revoking logout endpoint.
The server holds Google's encrypted refresh credential. The browser stores only
short-lived ID/access tokens, a `persistent: true` marker, the server's
`sessionExpiresAt` hint and the time of its last successful renewal. A legacy
token-only cache requires one fresh Google login; it cannot be upgraded merely
by changing the cache's expiry.

Google authorization retains **only** `openid email profile`, PKCE S256 and
state. `access_type=offline` and `prompt=consent` request renewal permission;
`include_granted_scopes` is deliberately absent. Popup handoff still checks
origin and exact popup source. The opener closes the popup only after accepting
the handoff; immediate callback-side closure can race queued message delivery
with the abandoned-popup poll. Standalone Android keeps redirect sign-in.
Pending sign-in includes a cross-tab generation, preventing callbacks from a
cancelled login from overriding later logout/login.

## Foreground renewal and failure handling

- Bootstrap route guards, foreground visibility/bfcache restoration and business
  request gates use one renewal operation per tab. Same-origin Web Locks also
  serialize token exchange, renewal and logout across tabs on supported browsers.
- A successful renewal is shared through localStorage and coalesced for at most
  **60 seconds**, including recent bootstrap/reopen. ID-token expiry with a
  30-second safety margin, old/future renewal timestamps or an elapsed server
  expiry hint force server consultation; old caches cannot extend seven-day
  expiry. The server remains authoritative, not a client seven-day timer.
- No periodic keepalive or hidden-tab renewal exists. Session HTTP fetches
  (initial exchange, refresh and best-effort logout) time out after **35 seconds**:
  API session budget **25s**, gateway/host **30s**, browser **35s**. Unrelated
  business requests keep their existing deadlines. A previously valid recent token may still serve an
  already-initiated business request; that does not extend server inactivity.
- Network failures, 502/503 and malformed successful renewal responses retain
  credentials. Bootstrap/foreground failures reuse the existing auth error card
  at `/auth/renew?returnUrl=…`, with **Try again**, rather than sending the user
  to Google. Pre-request renewal failures reach existing feature error regions.
- HTTP 503 `service_starting` is the paired API's explicit readiness failure
  **before** the Google exchange. The existing callback error card displays
  **Service starting** and permits only a deliberate **Try again** of that
  pending callback. Generic 5xx, network/CORS failure, timeout or malformed
  success do not prove the code was unused: retain pending route/state but mark
  the exchange attempted, including across reload, and restart Google on user
  retry instead of resending the code. No automatic code exchange retry exists.
  Popup exchange failures also land on this card without another exchange or
  Google redirect; `sessionError` is a display hint, never code-safety proof.
- Browser deadlines say **timed out / service may be unavailable**, not endpoint
  unreachable. Actual fetch rejection retains connectivity wording. Renewal
  renders the service's error rather than overwriting it with a connection
  diagnosis; transient errors never remove the persistent session.
- A definitive renewal 401 removes the short-lived cache and requires login,
  retaining the requested route. A business request may wait for renewal
  **before** sending; neither 401 nor 5xx business responses are replayed. There
  is no automatic financial retry.
- No unsaved form fields are persisted for authentication recovery. Genuine
  reauthentication recreates the requested route without its draft. Existing
  Bank prefill/submitted safety metadata is not a new editable-draft store or a
  permission to replay a Bank action.

## Device-only logout

Sign out synchronously clears the UI token cache and pending PKCE state, writes
an explicit local signed-out marker and changes the generation. The cookie
logout runs best-effort, independent of ID-token lifetime. In-flight responses
must match the generation before they can write auth state. Other tabs observe
storage changes and follow the same browser session; other browsers/devices and
Google itself are not logged out. Only a successful **explicit new login**
clears the signed-out marker.

Offline logout cannot guarantee immediate server revocation or HttpOnly cookie
clearing. The marker prevents this browser from silently renewing the leftover
cookie on reopen, even after failed logout. Clearing all site data also removes
that local protection; do not describe it as server revocation. Previously
issued Google ID tokens may remain independently valid until their signed
expiry. Browsers without Web Locks retain generation protection, but the API
must still safely serialize concurrent session refresh/logout.

## Provider limits and acceptance gates

No fixed Guito maximum lifetime is not a promise of an unrevocable Google
grant. Google can revoke/expire credentials; per-account/client refresh-token
limits (currently documented as 100) can invalidate older grants when repeated
consent creates more tokens. Google's general Testing-mode seven-day refresh
expiry has an exception for identity-only name/email/profile/openid scopes;
this app retains those scopes and must not silently broaden them.

Primary provider references:
- https://developers.google.com/identity/protocols/oauth2/web-server#offline
- https://developers.google.com/identity/protocols/oauth2#expiration

[Runbook and outstanding live gates](../persistent-login-runbook.md). Hermetic
browser tests establish UI wiring, lifecycle event handling, native Web Lock
coordination, native credentialed CORS against fake HTTP servers, and no replay.
They do **not** establish real Google consent, the deployed Secure cookie,
Android OS persistence, live secret provisioning or production readiness.
