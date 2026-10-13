# Bank review inbox (#133)

## Approved design and interaction

File `UoIK5MnIqDrgfHqMmBZoYk`, Guito App page. José approved the design/start
and explicitly required a fully collapsed initial list. Expanded exemplars are
not initial states.

| State | Mobile | Desktop |
| --- | --- | --- |
| Initial, all collapsed | [3328:523](https://www.figma.com/design/UoIK5MnIqDrgfHqMmBZoYk/Guito?node-id=3328-523) | [3328:603](https://www.figma.com/design/UoIK5MnIqDrgfHqMmBZoYk/Guito?node-id=3328-603) |
| Needs review, one expanded | [3312:370](https://www.figma.com/design/UoIK5MnIqDrgfHqMmBZoYk/Guito?node-id=3312-370) | [3312:506](https://www.figma.com/design/UoIK5MnIqDrgfHqMmBZoYk/Guito?node-id=3312-506) |
| Ignored, one expanded | [3312:662](https://www.figma.com/design/UoIK5MnIqDrgfHqMmBZoYk/Guito?node-id=3312-662) | [3312:798](https://www.figma.com/design/UoIK5MnIqDrgfHqMmBZoYk/Guito?node-id=3312-798) |
| Matched, one expanded | [3312:954](https://www.figma.com/design/UoIK5MnIqDrgfHqMmBZoYk/Guito?node-id=3312-954) | [3312:1089](https://www.figma.com/design/UoIK5MnIqDrgfHqMmBZoYk/Guito?node-id=3312-1089) |

Preserve shell/sidebar; title Bank transactions + Sync. All is initially
selected (primary black); unselected pills use base-200. One white rounded-16
card, no date-group headers. Rows use padding 16, gap 8, description/neutral
amount 14 semibold, booking day · review label 14 muted, Show details / Hide
details 12 muted. Expanded panel uses base-200, radius 8, padding 12, gap 8;
its black action is 36 high. Mobile body padding 16 yields a 370-wide card in a
402-wide viewport; desktop fills the inherited 992-wide main panel.

The whole summary is a native button with aria-expanded. Click/Enter/Space
expands that row and collapses the previous row; repeat activation collapses it.
Mutation buttons are separate siblings, never nested inside the summary button.
Filters (All / Needs review / Matched / Ignored) are client-side over one all-state
load and reset expansion. Matched summaries include the linked expense description;
expanded matched details include its Lisbon booking timestamp, amount and category.
Bank BOOK/currency remain separate from review state. The suggestion DTO is retained
at the HTTP boundary for later reconciliation, not rendered as a completed review.
The inline panel follows the approved status/currency/action layout without duplicating
the bank description. Its action uses radius 8, width 104 (Ignore) or 176 (Return to
review), no shadow; these dimensions come from the approved expanded frames.

Needs review offers Ignore; Ignored offers Return to review, with no confirmation.
The old Accept navigation is removed. No Match, Unmatch, candidates or Create
expense buttons are in #133; #135 owns atomic create-and-link. Existing independent
form timestamp/prefill compatibility tests remain valid, not an inbox capability.

## HTTP contract

- `GET /BankTransaction`: bare array, all rows by default; optional
  `reviewStatus=all|needsReview|matched|ignored`. Invalid filter returns 400.
- Each row: Int64 `id` JSON number|string (normalized to text), `accountUid`,
  day-only `bookingDate`, invariant exact decimal-string `amount`, `currency`,
  `remittanceInformation`, `status`, lower-camel `reviewStatus`,
  `suggestedCategory: {id,name}|null`, `linkedExpense: null|{id,bookingDate,amount,
  currency,description,category}`. Linked expense ID is Int32 number, timestamp
  includes Lisbon offset. Legacy numeric amount is adapted only at HTTP boundary.
- `POST /BankTransaction/{id}/ignore` and `/review` send `{}` and return the
  full updated DTO. Bad ID 400, absent row 404, matched conflict 409; repeated
  transitions to the same target are idempotent. No optimistic review labels or
  inferred matches. Exact amounts stay strings through locale formatting; display
  uses ECMA-402's decimal-string input rather than converting via Number.
- Bank list/mutation responses are requested as text and parsed with the native
  JSON reviver's `context.source` before normalizing numeric Int64 IDs. Large
  integer tokens become exact text; linked Int32 Expense IDs remain numbers.
  No wire-contract change or third-party parser is introduced. Engines without
  reviver source continue handling safe IDs, but fail closed on unsafe ones
  rather than offering actions against rounded IDs. Use an up-to-date browser.

## Failure and concurrency behavior

A single pending row owns its spinner; all mutations and Sync/Retry are serialized
with list refresh to prevent old data overwriting a successful mutation. Filters
and expansion remain interactive; pending completion cannot change the chosen
filter. Buttons reject duplicate requests synchronously. Failed mutations preserve
rows and expose an inline error. A 409 refreshes authoritative state without
resending the action; failed refresh keeps the previous list and offers Retry.
Initial loading and load-error Retry are explicit. Sync/result, empty state,
no-bank Open Settings, and consent callback confirmation are retained.

## Verification boundary

Approved seams: rendered Angular components with HttpTestingController, HTTP
service queries/DTO mapping, and built Chromium mobile/desktop flows with stubbed
transports. Tests cover initial collapse, exactly-one toggle, Enter/Space, all
filters, exact amounts/Int64 IDs, Lisbon linked metadata, Ignore/Return to review,
spinners/duplicates, 400/404/500 failures, 409 refresh and failed refresh retention,
filter/refresh races, initial Retry, Sync and missing-bank Settings navigation.
Production and staging builds are tested independently. No live API, bank consent,
real financial data, deployment or database persistence is implied by local gates.
