# Edit and delete one Expense — issue #70

## Authority and approved design

Implementation baseline: UI `744797e6335875850559eae2261d4dacd7fa4278`
(version 0.7.0; next minor 0.8.0). API authority:
`49ffc0242fa5d6b138f8cb0a79060f13e84bd5a2`, merged guito-api PR #148.
Read ExpenseController, ExpenseDetailResponse, ExpenseUpdate and
ExpenseEditDeleteBoundaryTests at that SHA. UI issue and both comments were read
in full. The [draft/contract comment](https://github.com/JoseHRosario/guito-ui/issues/70#issuecomment-6166989293)
and [approval](https://github.com/JoseHRosario/guito-ui/issues/70#issuecomment-6167052038)
authorize the linked screens and TDD seams.

Figma file `UoIK5MnIqDrgfHqMmBZoYk`, Guito App page:

| State | Mobile | Desktop |
| --- | --- | --- |
| Edit | 3359:570 | 3359:644 |
| Validation | 3362:859 | 3362:935 |
| Request rejected | 3362:1024 | 3362:1100 |
| Delete confirmation | 3361:683 | 3361:710 |
| Unsaved changes | 3361:738 | 3361:765 |
| Stale revision | 3361:793 | 3361:820 |
| Already absent | 3361:848 | 3361:875 |
| Checking outcome | 3361:903 | 3361:930 |
| Current resource found | 3361:958 | 3361:985 |
| Current absence | 3361:1013 | 3361:1040 |
| Check failed | 3361:1068 | 3361:1095 |

[Recovery gallery](https://www.figma.com/design/UoIK5MnIqDrgfHqMmBZoYk/Guito?node-id=3361-681)
· [Interaction contract](https://www.figma.com/design/UoIK5MnIqDrgfHqMmBZoYk/Guito?node-id=3362-1189).

Mobile form order: Amount, Description, Date/Time, Category, full Save changes,
Cancel/Delete expense side by side, precision note. Desktop: Amount left and
Date/Time right, full Description, half Category, Save/Cancel/Delete row.
Existing shell chrome and token theme are retained. Creation, favorites, voice
and Bank create flows retain their existing contracts.

The edit Time field accepts `HH:mm`, optional seconds and up to six fractional
digits as text: native HTML time controls reject six-digit fractions and render
an empty value. This preserves the approved full-precision display; creation's
native Time remains unchanged. Unchanged edit saves preserve the original offset,
seconds/microseconds and decimal string/scale (including signed zero). Date/time
changes resolve against Lisbon; DST gaps and unresolved folds are rejected.
Changed amounts use the existing textual .NET decimal validation. Description
may be empty and is not trimmed. Currency is EUR.

## HTTP boundary

- Identity is a positive numeric Int32, at most 2147483647. No ordinal fallback.
- GET `/Expense/{id}` on entry, direct reload, explicit reload and readback,
  requested with `Cache-Control: no-store`. Valid detail requires exact-string
  amount, offset timestamp, EUR, same ID and strong quoted ETag consistent with
  decimal Int64 `revision`. Missing/malformed tokens block mutation.
- PUT `/Expense/{id}` sends only `amount`, `description`, `category`,
  `bookingDate`, `currency`, all editable fields. DELETE targets that same ID.
  Both send the loaded quoted ETag unchanged as `If-Match`.
- Requests have a 15-second deadline. Neither service nor page retries a write.
  Only received PUT 200 / DELETE 204 acknowledges success.

## Recovery and navigation

| Outcome | Behavior |
| --- | --- |
| Initial GET fails | Retry read / Back to expenses; writes unavailable |
| Definite 4xx | Retain fields; show rejection; category 422 refreshes choices and names Category; 401/403 asks for sign-in through the existing account menu |
| 412 | Retain edits and loaded revision; block writes; Reload warns and explicitly confirms discarding edits |
| 404 | Resource unavailable; retain edits; Back to expenses; never recreate |
| Timeout/network/408/5xx | Retain original operation intent/revision, check GET exact ID, block writes |
| Readback 200 | Show current resource/revision, never infer our write succeeded even if values match; deliberate Reload discards edits and starts a fresh intent |
| Readback 404 | Current absence only, never infer our deletion succeeded; Back to expenses |
| Readback fails | Outcome unknown; Check again sends GET only; no write retry |

Dirty fields use a routed canDeactivate prompt: Keep editing / Discard changes.
Discard copy describes only leaving retained edits, never the saved resource's
state. An uncertain outcome remains unconfirmed even when readback finds absence.
Current-resource summaries in both the recovery dialog and retained-edit view
show description, exact amount, category, full offset bookingDate (including
seconds/microseconds), and revision separately from the original editable fields.
Clean Cancel/Back leaves immediately. In-flight writes and outcome checking block
in-app departures. Supported browser exits use native beforeunload protection.
Dialogs use native modal/inert semantics, explicit Tab cycling, safe initial
focus, Escape as Keep editing/Cancel and focus restoration. Checking has no
mutation action. Reload always warns that retained edits will be discarded.

Acknowledged writes navigate to the route-reused list and refresh latest 20,
including date grouping/server order. Toasts distinguish updated/deleted from
created. A changed expense may leave latest 20. Toast cleanup cannot navigate
away from a subsequent edit. Scroll restoration is best effort, bounded by the
refreshed list's height.

## Reconciliation follow-up — not implemented

The current detail DTO has no verified matched/link-state field. The UI renders
no matching warning and infers no link from description, amount or bank rows.
Future verified matching must warn before amount/date/time changes while
retaining links. Matched deletion must explain that the surviving transaction
returns to Needs review; the API must atomically unlink/delete. API link-schema
compatibility alone does not prove a shipped UI matching capability.

## Verification boundary

Agreed seams: ExpenseApi HTTP, rendered routed form/dirty guards, built Chromium
flows. RED outputs, gate logs and responsive form/recovery screenshots are local
scratch artifacts, summarized in `issue70-result.md`. Production and staging
configurations must each be built and run against the full hermetic browser
suite. Unit tests use `npm test -- --include=...`, Angular's builder.

Live staging integration is separate and **not exercised**. The owner gave #70
priority to merge to master first; parent publication/deployment need not wait for
sibling feature #133 / PR #71. That sibling Bank inbox (deployed at `33f760c`
before this work) is not included in #70's pinned baseline. Parent review and
served-build verification still precede live acceptance. This implementation
worker is not authorized to push/deploy, mutate live finances or write AWS credentials.
The local stubs do not establish Postgres persistence, live CORS or live staging
acceptance. Safari/Firefox and unsupported browser exit paths are not claimed.
