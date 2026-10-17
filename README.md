# Guito UI

The web frontend of **Guito**, a personal expense tracker: control expenses and maximize savings. This SPA consumes the [guito-api](https://github.com/JoseHRosario/guito-api) HTTP API and is designed screen-by-screen in Figma before any code is written.

> Live demo: https://guito.web.kerumirembora.com/ (deployed from `master`). Local tests stub the API; production consumes guito-api.

> Status: the auth-gated app, latest expenses, create/voice/favorites and Bank/Settings flows are implemented. Issue guito-api#128 adds editable native Time beside Date from the approved canonical frames, Lisbon occurrence timestamps and numeric expense IDs. Production now enables the existing timestamp capability after the approved guito-api#132 Postgres cutover (fix guito-api#145); dev/staging settings are unchanged. All create paths send `bookingDate`, and exact decimal strings preserve POST/prefill precision. Production release and an owner-confirmed genuine save remain merge/deploy verification gates; see [ADR 0014](docs/adr/0014-expense-occurrence-lisbon.md).

## Bank review (#133–#135)

Bank opens on **All** with every transaction collapsed. Clicking a row (or
Enter/Space on its native button) expands exactly one inline detail; clicking it
again collapses it. Filters are All / Needs review / Matched / Ignored. Booking
status (for example BOOK) is distinct from Guito review state. Matched rows show
the linked expense; dates render in Europe/Lisbon. Ignore and Return to review
apply without confirmation. Failed updates preserve the row, and a conflict
refreshes authoritative state without retrying the mutation. Initial load errors
have Retry; failed refreshes preserve the previous list. Sync and Open Settings
for missing bank connections are retained.

Manual matching (#134) adds explicit Match/Unmatch with server suggestions and
read-only contextual history. Create-and-match (#135) opens the existing approved
Create Expense page (mobile `3094:35`, desktop `3094:9704`), retaining its editable
form and layout. By explicit owner instruction there is no new Figma gate; deleted
#135 drafts remain deleted. Bank Save uses only the atomic Bank endpoint, with
persisted intent and receipt-based recovery. See [#134](docs/issue134-manual-matching.md)
and [#135](docs/issue135-create-and-match.md). Local hermetic tests do not establish
live API/Postgres acceptance.

## Expense edit/delete (#70)

Expense rows with a numeric ID open `/expenses/:id/edit`. The editor reads current
values and revision by ID, preserves untouched exact decimal text and timestamp
precision, and updates/deletes with `If-Match`. Dirty navigation requires an
explicit discard; uncertain responses require GET-only checking and deliberate
reload before a new write. Only acknowledged PUT 200/DELETE 204 return to the
refreshed list with an updated/deleted toast. Matching is follow-up because the
current detail DTO exposes no verified link state. See the [issue #70 contract](docs/issue70-edit-delete-expenses.md).
Local production and staging browser suites use hermetic fixtures. This branch
reconciles #133 with merged #70 / PR #72, retaining its native minute-only Time
control, exact timestamp preservation, recovery and route-cache behavior. Local
checks do not establish live API/Postgres acceptance for #133; rollout and owner
acceptance remain separate gates. No deployment or financial mutation is part of
this reconciliation.

## Tech stack

| Layer     | Choice                                                        |
| --------- | ------------------------------------------------------------- |
| Framework | Angular 22 (standalone components, signals, zoneless-friendly) |
| Styling   | Tailwind CSS 4 + daisyUI 5, themed entirely by design tokens   |
| Tests     | Vitest (unit, jsdom) + Playwright (e2e, both breakpoints)      |
| Hosting   | S3 + CloudFront (eu-west-1), deployed by GitHub Actions (OIDC)  |

## Design loop (how UI work happens)

1. **Draft**: Hermes (the AI agent) composes the screen on the **Guito App** page of the Guito design file — José's duplicate of the *Simple Design System (Community)* Figma file — using the design system's components, icons, and variables.
2. **Validate**: José reviews/edits the frame in Figma. Approval = the implement source; designs change in Figma, never as code-side drift.
3. **Implement**: the agent reads the approved frame, converts it to Angular components, and styles everything from the token-generated theme.

**Tokens pipeline**: the design file's 'Color' variables (SDS Light mode) are synced via the Figma MCP into `design/tokens.json` (style-dictionary shape; mapping in `tools/tokens/figma.json`) → `npm run tokens` → `src/theme/tokens.css` (`--guito-*` custom properties + daisyUI semantic aliases). Light mode only. No ad-hoc hex values in components — see [AGENTS.md](AGENTS.md) for the hard rules.

## Getting started

```bash
npm ci
npm run tokens   # regenerate the theme from design/tokens.json
npm start        # ng serve → http://localhost:4200/
```

## Testing

```bash
npm test                 # Vitest unit tests (specs live next to the code)
npx playwright test      # e2e against the built app (serves dist on :8081)
npm run build            # production build (runs the token pipeline first)
```

## Project structure

```
src/app/
  core/       cross-feature environment, auth, bootstrap and route reuse
  core/auth/  Google PKCE session: AuthService (signals), session storage, pkce
  features/   feature-nested pages, components, models and services (shell included)
  shared/     cross-feature components (inline SVG icon set)
src/theme/    tokens.css — GENERATED, never hand-edited
design/       tokens.json — style-dictionary source of the theme
tools/tokens/ token pipeline: build-tokens.mjs, figma.json (role→variable map)
e2e/          Playwright specs
docs/adr/     UI decision records (0001–0010+)
```

## Deployment

`.github/workflows/`: `ci.yml` runs the full gate (tokens → build → Vitest → Playwright) on every PR; `deploy.yml` on push to `master` syncs `dist/` to S3 and invalidates CloudFront — AWS authentication is OIDC-only (role `guito-ui-deploy`, no long-lived keys). Any branch can be deployed on demand via `workflow_dispatch` for review-before-merge.

## Docs

- [GLOSSARY.md](GLOSSARY.md) — glossary (design file, design loop, token sync)
- [docs/adr/](docs/adr/) — decisions (token source = Figma MCP sync, …)
- [AGENTS.md](AGENTS.md) — rules for AI coding agents
- [guito-api](https://github.com/JoseHRosario/guito-api) — the backend (issues for both repos live there)
