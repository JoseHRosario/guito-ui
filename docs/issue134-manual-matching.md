# Manual Bank Transaction matching (guito-api#134)

## Approved source

[Final design approval](https://github.com/JoseHRosario/guito-api/issues/134#issuecomment-6220256560).
The owner file is `UoIK5MnIqDrgfHqMmBZoYk`:

- Desktop side-by-side: `3522:1235`.
- Mobile initial collapsed: `3565:1712`; candidates: `3512:1019`;
  no suggestions: `3512:1128`; linked / Unmatch: `3512:1205`;
  read-only history: `3565:1788`.

This supersedes ADR-0015's #133 composition, not its identity/auth boundaries.
Desktop removes promotional/profile sidebars and presents independently scrolling
Bank Transactions and Existing Expenses, with headings outside their scrollers.
Mobile uses Transactions / Expenses view buttons; mounted scroll containers retain
per-view position, filter, expanded Transaction and shown-candidate count.
All is initially selected and every Transaction initially collapsed.

Canonical List Expenses row structure supplies date groups, category icon circles,
compact title/meta hierarchy, separators and right-aligned red debit presentation.
Positive values acquire a minus **only for display**; original wire amounts never
change. The existing generated palette/font and shell are retained: these currently
differ from the Figma artwork's teal icons, cream canvas and font. No token-map,
token source or pipeline change is included or implied by this implementation.

Panels show candidate description/date/amount and Match, Show more (remaining),
and Ignore. No BOOK/currency commentary, eligibility reasons or helper paragraphs.
The linked panel shows Linked Expense, occurrence/category data, date and Unmatch.
The empty panel says No suggested matches, not that no Expense exists.
Its Create expense action is visibly disabled, with an accessible future-feature
label/title: atomic create-and-link belongs to guito-api#135. It never navigates or
creates an unlinked Expense. This is a deliberate safety restriction on the
approved action's representation, not implementation of #135.

## HTTP boundaries

- `GET /BankTransaction`: existing bare all-state array adds
  `suggestedExpenseCount`; filtering stays client-side over all Bank links.
- `GET /BankTransaction/{id}/suggestions`: complete eligible server-ordered bare
  array of `{id,bookingDate,amount,currency,description,category}`. Initial display
  is three; Show more reveals the rest. A zero authoritative count needs no extra
  candidate request. Contextual history is never an eligibility source.
- `POST /BankTransaction/{id}/match` sends `{expenseId:number}`.
- `POST /BankTransaction/{id}/unmatch` sends the **expected current link's**
  `{expenseId:number}`. Both return the updated Bank Transaction and count.
- `GET /Expense/history?pageSize=100&pageIndex=0`: existing authenticated human
  read, `{pageSize,pageIndex,totalCount,hasMore,expenses}`. Load older Expenses
  advances offset pages; duplicate IDs from live-page drift are deduplicated,
  then sorted by exact occurrence instant (including microseconds) and numeric
  Expense ID descending. Refresh re-reads loaded pages. This is not a snapshot/export guarantee.

Bank Int64 identities retain original raw JSON numeric tokens through `bankJson`;
Expense Int32 IDs remain numbers. Exact decimal strings survive service and view
formatting without Number conversion. History retains stored amount/timestamp
text. Bank date groups use booking days, history uses Europe/Lisbon occurrence
and the API's descending occurrence/ID order. No row alignment is implied.

History is read-only, includes linked/unlinked Expenses, and derives Matched from
all known Bank links (not the active filter). Suggested denotes candidates of the
currently expanded Transaction. It has no arbitrary Match, editor, manual search
or drag/drop affordances.

## Single-user failure handling

Basic in-flight guards suppress duplicate actions. Match/Unmatch refresh all Bank
rows/counts, current suggestions and loaded history after acknowledgement,
conflict or uncertain response. An inconsistent success payload also requires
readback. No unknown mutation is automatically repeated; refreshed state requires
another deliberate user click. Failed Bank recovery keeps actions unavailable
until Retry. Suggestion response sequencing prevents an old expanded row's result
from replacing the current panel. Loading, error and factual empty states remain
distinct, with explicit retry controls.

The owner explicitly deferred dedicated real-concurrency acceptance: one person
at a time is the present scope. No new multi-user framework or concurrency UX is
introduced. Hermetic stale/unknown-response coverage protects ordinary double taps
and stale tabs; it does not claim real multi-user or deployed persistence proof.

## Verification boundary

Rendered Angular + HttpTestingController, API adapters and built Chromium tests
use fake transports; fallback financial routes reject unstubbed requests.
Production/staging builds, typechecking and full unit/browser suites are local
gates. Screenshots are emitted under `test-results/matching-*.png`. No deployment,
real Google auth, provider call, live financial write or staging persistence test
is authorized by these results. Parent review and owner staging gate remain
separate.
