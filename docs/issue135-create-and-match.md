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

- POST `/BankTransaction/{id}/create-and-match` sends flat existing ExpenseCreate
  fields (`bookingDate`, `currency`, exact-string `amount`, `description`,
  `category`) plus `operationId` UUID.
- GET `/BankTransaction/{id}/create-and-match/{operationId}` reads an immutable
  historical receipt. 200 is `{operationId,transactionId: numeric Int64,expenseId:
  Int32}`; 404 means no committed receipt is visible, not proof of rollback.
- Both responses use the existing lossless `bankJson` numeric-token pipeline.
  Mismatched identities or malformed receipts cannot acknowledge completion.
- Reads rely on the server's no-store policy, without a CORS-changing request
  Cache-Control header. Requests have a 15-second deadline. No automatic POST retry.
- 400 retains editable values for validation; 404 missing Bank / 409 changed intent
  or stale Bank block fresh saving and return to Bank for review; 422 refreshes
  categories; auth rejections remain definite. Lost/network/5xx responses,
  including 502, require GET receipt checking.

## Recovery and return

Before the first POST, sessionStorage retains the frozen payload and UUID without
any authentication secrets. Reload restores that same operation and checks GET.
While in flight or uncertain, inputs and Save/Cancel are disabled; routed
canDeactivate and native beforeunload guard departures. Check again reads only.
Retry same operation first reads GET; only a 404 permits the deliberate same
POST with identical payload and UUID. Other failed checks never permit a write.
No fresh operation is allowed while the prior outcome remains unknown.

A valid receipt is historical completion, even if someone already unmatched the
Expense. It never causes replay, Match or relinking. Completion is retained
locally and returns to an authoritative Bank/history reload. Bank filter,
expanded row, mobile view and scroll position are retained across the form;
a matched row hidden by Needs review is collapsed without changing that filter.
Fresh explicit Create after a completed operation is a new intent; revisiting the
completed form itself cannot replay the historical operation.

## Verification boundary

Agreed seams: HTTP adapter, routed rendered Angular/navigation, built Chromium.
Tests use fake transports, not real API writes. Local production/staging builds,
unit/browser results do not claim live Postgres persistence acceptance. No API
edits, dependencies, token mapping, pipeline, deployment or AWS changes belong
to this issue. Version: 0.11.0.

Local verification for this implementation: app/spec `tsc --noEmit`, tokens,
400 unit tests across 37 files, production and staging builds, and full Chromium
suites against each build (63 passed, 1 skipped per configuration). Both builds
warn about the initial bundle at approximately 504.5 kB versus the 500 kB warning threshold;
the build error threshold is not exceeded. The skipped deployed smoke remains
outside this local-only run.

The app explicitly uses single-user shared data. Principal/account isolation is
outside #135; recovery storage holds no authentication secrets.

Independent review regressions use production routes and reuse wiring for
query-only Bank context changes, and rendered component recovery for invalid
stored fields and explicit frozen wire reconstruction. Browser return coverage
reloads Create before Cancel and checks loaded history pages and both offsets.
