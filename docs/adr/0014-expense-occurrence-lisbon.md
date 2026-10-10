# Expense occurrence: Lisbon wall clock and opaque identity

## Decision (guito-api#128)

Europe/Lisbon is the business timezone, independent of the browser's timezone.
New manual expenses capture one current instant when the form opens. Date and
native Time (`HH:mm` wire value) are editable; favorites capture now on tap.
A date-only voice proposal or bank booking retains its day and defaults its time
to the form's captured current Lisbon time. Midnight is only a historical import
rule, not the default for new expenses. Bank acceptance still only prefills the
form: this issue does not implement atomic create-and-match or automatic matching.

Known offset timestamps supplied through voice/bank prefill are displayed in
Lisbon and preserved verbatim (including offset and seconds) on an unchanged
save. A legacy offset-bearing voice `date` is also a known timestamp. Date/time
edits invalidate the known instant; amount/description/category edits do not.
No implicit browser-local parsing determines a new expense instant.

Local date/time is resolved against Lisbon's IANA rules via `Intl`. Winter uses
`+00:00`, summer `+01:00`. Spring-forward nonexistent times are rejected before
POST. Autumn-fold ambiguous times are rejected unless the unchanged prefill or
captured now already supplies a known instant. The native control offers no
offset chooser: users entering an ambiguous time must select an unambiguous
one. We do not silently choose either side of the fold.

## Wire contract and transition

`APP_ENVIRONMENT.expenseTimestampsEnabled` is an explicit build-time capability:
production is **false**, development/staging are **true**, and an absent flag is
legacy-safe (false). Production auto-deploy must not activate timestamps before
the API's Postgres cutover. Enable production only after verifying persistence.

When enabled, `POST /Expense` sends `{date: 'yyyy-MM-dd', occurredAt:
ISO8601-with-offset, currency: 'EUR', amount, description, category}` and the
approved Time control/validation applies. When disabled, Time is not rendered or
validated and POST sends **only** `{date, amount, description, category}`. The
central ExpenseApi gate applies to every create path, including favorites.
Sheets explicitly returns 409 for occurrence writes; it does not merely ignore
unknown timestamp fields. Never discard an enabled timestamp to retry as legacy.

Amounts use normalized invariant **decimal strings**, not JavaScript Number
conversion, preserving `123456789.123456789` and `9007199254740993` through form
validation and POST. Signed and zero amounts are valid (approved guito-api#137
schema review); no automatic sign reversal is applied to manual, voice, bank or
favorite values. An optional leading plus is normalized away, and negative zero
becomes `0`. .NET decimal's 96-bit coefficient / scale <=28 are checked textually
against the absolute coefficient before submission. The coordinated API accepts numeric or
string amounts; old numeric clients remain compatible. Latest/AI DTOs keep their
numeric `amount` for display compatibility and may supply `amountExact`; prefills
prefer that sibling (including bank metadata when supplied). Without exact
metadata, numeric prefills/favorites preserve the value already represented by
the Number's string serialization, not precision previously lost upstream.
Trailing insignificant zeros may be normalized; no two-decimal transport rounding
is applied. Bank display formatting/suggestion logic is unchanged. UI deployment
alone does **not** prove the API's decimal-string contract or persistence.

Create returns `{id: string}` including generated integer IDs serialized as
strings; the UI treats it as opaque. Nullable `updateDate` is audit metadata,
ignored by list mapping and never substituted for `occurredAt`. Numeric old-server
responses are tolerated by converting them to strings, never ordinals extracted
from new IDs. Latest remains wrapped in `{expenses: [...]}`. Real `id` wins over
`storedOrder` unchanged; `occurredAt` wins over legacy `date`. Old-server
`storedOrder` fallback is rendering-only compatibility, **not durable identity**,
and must not be used for reconciliation or persisted references. The list groups
by Lisbon occurrence day and preserves the server's descending timestamp order
within each day; it does not re-sort by ID, audit timestamps or offset strings.
Creation/update audit timestamps are not expense dates.

## Canonical approved design source

File `UoIK5MnIqDrgfHqMmBZoYk`, Guito App page:

- [Mobile 3094:35](https://www.figma.com/design/UoIK5MnIqDrgfHqMmBZoYk/Guito?node-id=3094-35)
- [Desktop 3094:9704](https://www.figma.com/design/UoIK5MnIqDrgfHqMmBZoYk/Guito?node-id=3094-9704)
- [Validation 3094:9937](https://www.figma.com/design/UoIK5MnIqDrgfHqMmBZoYk/Guito?node-id=3094-9937)
- [Save failure 3094:10011](https://www.figma.com/design/UoIK5MnIqDrgfHqMmBZoYk/Guito?node-id=3094-10011)
- [Voice prefill 3134:10053](https://www.figma.com/design/UoIK5MnIqDrgfHqMmBZoYk/Guito?node-id=3134-10053)

Time sits beside Date in a single row on both breakpoints, labeled only `Time`
(no timezone helper label). Mobile order: Amount, Description, Date/Time,
Category, full-width Save. Desktop: Amount in the left half and Date/Time in the
right half, then full-width Description, half-width Category, 240px Save. Shared
form template uses token-derived styling and unique responsive input/label IDs.
Native date/time **display** follows the browser locale (may show MM/DD/YYYY or
AM/PM); date/time **values** stay ISO day and HH:mm. This is deliberate native
input behavior, not a custom segmented picker.

Functional screenshots were compared to canonical mobile/desktop references.
The form's field order, row alignment and desktop widths match; inherited shell
chrome differs from the old references (five tabs including Bank, current avatar,
header/footer placement, typography/background theme). This is not a claim of
whole-screen pixel identity, and #128 does not redesign the shell.

## Verification boundary

Agreed seams: rendered Angular components/router navigation and Chromium browser
flows with transport stubs. Tracers were run red then green for Time/POST,
voice timestamp preservation and prefill precision. Coverage includes Lisbon now
near UTC midnight, summer/winter offsets, DST gap/fold rejection, preservation of
known fold instants until edit, voice/bank date-only defaults, opaque list IDs,
server row order, signed/zero precision and overflow rejection, save loading/retry, and mobile/desktop
alignment in a non-Lisbon browser timezone. No live API, Postgres persistence,
AWS, real speech recognition, Safari/Firefox or real bank consent was exercised.
Local browser verification must use the corresponding built configuration:

```sh
npm run build
npx playwright test --workers=2                         # production legacy
npm run build -- --configuration staging
GUITO_TIMESTAMPS_ENABLED=true npx playwright test --workers=2  # opt-in timestamps
```

The test-only environment variable selects expected behavior; it does not change
the application's capability. Default CI build/expectations remain production.

Review regressions cover explicit/absent capability at the HTTP seam, both built
production legacy and staging timestamp browser modes (including favorites),
manual exact decimals, exact AI/bank prefill round-trips, and an arbitrary +05:30
known instant displayed in Lisbon and preserved unchanged.
