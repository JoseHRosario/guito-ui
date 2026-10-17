# Create and match — UI #135

## Existing page authority

Owner instruction explicitly overrides a new design loop for this issue: reuse
canonical Create Expense mobile `3094:35` / desktop `3094:9704` with existing
shell, header, layout, editable form and existing error block. No pending Figma
gate or new screen is required. Deleted #135 drafts must remain deleted.
Manual, voice and favorite creation retain their existing Expense endpoint and
form semantics. ADR 0014 governs Lisbon occurrence and exact decimal amounts.

Every Needs review row offers Create, including zero suggestions. Suggestions
and loaded history impose no amount, date or category constraints on explicit
creation. Bank context carries exact positive Int64 text, persisted prefill and
`bankTransactionId` query context for reload. Invalid/missing context or failed
sessionStorage access blocks Bank saving; it never falls back to POST /Expense.
Cancel and normal Back before Save write nothing.

## HTTP contract

- POST `/BankTransaction/{id}/create-and-match` sends only flat existing
  ExpenseCreate fields: `bookingDate`, `amount`, `currency`, `description`,
  `category`. Amount remains exact decimal text.
- 200 returns the existing BankTransaction review DTO, as manual Match does.
  Bank Int64 identities use the existing lossless `bankJson` pipeline.
- Lost/network/5xx responses, including 502, require current-state readback through
  the bare array `GET /BankTransaction`. No receipt endpoint, UUID, payload
  ledger, idempotency retry or automatic POST exists.
- Requests/checks have a 15-second deadline. No CORS-changing headers are added.
- 400 retains editable values for validation; 404 missing Bank / 409 stale Bank
  block saving and require Return to Bank; 422 refreshes categories. Auth
  rejections remain definite.

## Uncertainty and return

Before POST, sessionStorage retains only the existing Bank prefill/context and a
minimal submitted marker. A matching browser-history entry marker keeps an older
submitted form locked even after a fresh Create resets the shared prefill context.
Submitted edits are never persisted. Reload/back with either marker checks current
Bank state and cannot submit from the revisited form.
An unresolved/read-failed check retains the form and uncertainty. Check again is
read-only. If the current transaction is matched with a linkedExpense, return to
Bank's authoritative current link without claiming this Save succeeded. A later
Unmatch is never replayed or repaired by this form.

Inputs and departures are guarded during an actual request/check. After an
unresolved check, fields remain available but Save stays disabled; Return to Bank
is available. Another POST requires deliberate Return to current Bank and a fresh
Create click. Fresh Create cannot replace context while the original request is
still in flight. Definite validation rejection allows correction on the same form.

Bank filter, expanded row, history pages, mobile view and scroll offsets survive
return through the existing Bank return state. A matched row hidden by Needs
review is collapsed without changing that filter. Manual, voice and favorite
creation remain unchanged. Owner simplification overrides obsolete receipt
instructions in skills and earlier issue directions.

## Verification boundary

Agreed seams: HTTP adapter, routed rendered Angular/navigation, built Chromium.
Tests use fake transports, not real API writes. Local production/staging builds
and unit/browser results do not claim live Postgres persistence acceptance.
No API edits, dependencies, token mapping, pipeline, deployment or AWS changes
belong to this issue. Version remains 0.11.0.

Local verification: app/spec TypeScript checks, tokens, 394 unit tests across
37 files, and production/staging builds passed. Full Chromium suites against each
configuration passed with 63 passed and 1 deployed-smoke skip. An initial staging
popup sign-in failure did not reproduce on a full rerun. Both builds warn at
503.18 kB against the 500 kB initial-bundle warning budget; no error budget is
exceeded. Independent review regressions cover malformed matched responses and
Back to an old submitted entry after fresh Create.
