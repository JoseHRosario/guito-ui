# Domain and contract discovery

Before domain/DTO/financial behavior changes, read [GLOSSARY.md](../../GLOSSARY.md) and [ADR 0014](../adr/0014-expense-occurrence-lisbon.md). This is a single UI context; there is no CONTEXT.md or context-map fallback. A missing required reference is a documentation defect: report/fix it, not a silent skip. Use the glossary's vocabulary; flag conflicts with accepted ADRs before changing behavior.

## Source and boundary checks

Inspect `features/expenses/models/expense.ts`, `services/expense-api.ts`, `validate-expense.ts`, `expense-time.ts` and the producer/component you change. Preserve one exact amount, numeric Expense identity and Lisbon booking semantics through HTTP → prefill → rendered form → request. Test large integers/long fractions, signed/zero values, null legacy rows, unchanged microseconds and DST boundaries at public component/browser seams. Current `money.ts` converts to Number for display: do not claim exact rendering from exact POST tests or silently change formatting in a docs task.

`APP_ENVIRONMENT` owns runtime configuration. Checked-in production/dev/staging timestamp flags are true at the #149 baseline; absent remains legacy-safe. The transport selects exactly one occurrence property (`bookingDate` when enabled, legacy `date` otherwise), never both/`occurredAt`. Internal review-prefill `date` is intentional, not a second wire contract. API cutover and UI capability require coordination; checked-in flags do not establish deployed authority.

Before auth transport edits, inspect `core/auth/`, `app.config.ts` and [ADR 0011](../adr/0011-auth-gate-all-routes-google-only.md). API-origin human requests carry **both** `Authorization: Bearer <idToken>` and `x-google-idtoken: <idToken>`; neither uses the access token. Never forward credentials to external/lookalike origins. Sign-in/callback are bare routes with signed-in guards; the shell parent guards app routes. Guards without interaction changes do not require the entire Figma history.

## Reconciliation and edit/delete prerequisites

Dated code-discovery snapshot, **14 October 2026**, base `744797e6335875850559eae2261d4dacd7fa4278`:

- [UI PR #71](https://github.com/JoseHRosario/guito-ui/pull/71), head `33f760c93e7802f0f42e2b7b6b64b8624b83458e`, is open/unmerged. It corrects glossary identity/booking terms and adds the collapsed initial bank inbox/review states with `docs/adr/0015-bank-review-inbox.md` **on that branch**, not this baseline. This router incorporates vocabulary corrections without claiming inbox implementation here.
- [UI PR #72](https://github.com/JoseHRosario/guito-ui/pull/72), head `2898db040c5b32833788635302959d855992d8c0`, is open/unmerged. Its `docs/issue70-edit-delete-expenses.md` is a branch-local contract, not a missing local link. Edit/delete is not implemented on this baseline.
- [API PR #148](https://github.com/JoseHRosario/guito-api/pull/148) is merged, but API merge alone does not land either UI feature or prove a deployment.

Before working on either feature, reread live issue/PR bodies and owner decisions, establish the selected UI/API refs, then read the relevant contracts/ADRs **at those refs**. Read the API worktree's root AGENTS explicitly; use its current mutation/concurrency/security contracts rather than inferring them from the old BankApi comments. After merge, replace branch prerequisites with real local links in the same update.

Bank transaction Int64 identity is not an Expense ID. The baseline string coercion cannot recover unsafe JSON numeric digits already rounded by JavaScript. Preserve unrelated bank/category contracts and fail closed for unsafe mutation identity; do not widen Expense IDs or assert the open PR's parser is already on master. Reconciliation is manual one-to-one, not category-based auto-matching. Create-and-link/unmatch and expense edit/delete need their own approved contracts, concurrency/recovery rules and tests; never retry an uncertain financial mutation blindly.

For migrations, cutover, imports or authenticated reporting, use [operations](operations.md) and the current API repository's selected contract/ADR. No UI glossary can establish live datastore authority or permission to mutate data.
