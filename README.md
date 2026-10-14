# Guito UI

The Angular frontend of **Guito**, a personal expense tracker consuming [guito-api](https://github.com/JoseHRosario/guito-api). Visual/interaction work follows Figma draft → José's validation → implementation from the approved frame. Backend tracker issues may cover work in both repositories.

Production entry: https://guito.web.kerumirembora.com/ ; shared staging: https://guito-staging.web.kerumirembora.com/ . These are configured entry points, not a live deployment verification.

## Implementation scope

At the #149 documentation baseline (`744797e6335875850559eae2261d4dacd7fa4278`, 14 October 2026), code includes auth-gated expenses, manual/voice/favorite creation, Bank sync/Accept-to-prefill and Settings version/bank-connection flows. Dashboard/Budgets remain title-only screens. Expense creates use `bookingDate` and exact decimal strings with the checked-in timestamp capability enabled for production/dev/staging. This is source evidence, not served-production or genuine-save acceptance.

The newer reconciliation inbox (UI PR #71) and expense edit/delete (UI PR #72) are **open/unmerged** at this snapshot; merged API #148 does not implement either in this UI baseline. Recheck live refs and owner decisions before feature work; [domain prerequisites](docs/agents/domain.md) distinguish branch-local contracts from landed code. Approval and deployment must be verified independently of implementation existence.

## Stack and architecture

Angular 22 standalone components/signals, TypeScript 6, Tailwind CSS 4 + daisyUI 5, Vitest/jsdom and Playwright. S3 + CloudFront hosting is delivered through GitHub Actions/OIDC. See [CONVENTIONS](docs/CONVENTIONS.md) before source/test changes.

```text
src/app/
  features/<feature>/
    pages/       top-level screens
    components/  reusable regions; shell/components holds layout chrome
    models/      feature types
    services/    HTTP adapters, feature helpers and fixtures
  core/          cross-cutting auth, environment, bootstrap and router wiring
  shared/        cross-feature presentational pieces
src/theme/       generated tokens.css (outside app/)
design/          tokens.json theme source
tools/tokens/    token compiler and Figma role mapping
e2e/             built-browser tests
docs/adr/        UI decisions and rationale
```

Single-feature helpers stay with their feature; core is not a general dumping ground or a frozen list of auth-only files. API origins/capabilities are injected via `APP_ENVIRONMENT`, not imported by components from environment files.

## Getting started

CI uses Node 22; `package.json` declares npm 11.19.1. Use the locked dependency graph:

```sh
npm ci
npm run tokens   # compile theme from design/tokens.json
npm start        # localhost:4200, development configuration targets staging API
```

Local development can reach the configured API: do not treat it as an isolated financial sandbox. Tests must stub transports.

## Build and test

With dependencies and Playwright Chromium installed, unset `SMOKE_URL` for local tests. Playwright starts the SPA-fallback server on :8081 and requires the built application:

```sh
npm run tokens
npm run build                  # production → dist/guito-ui/browser
npm test                       # ng test / Vitest, specs next to code
npx playwright test            # local built-browser transport stubs
# To verify the staging configuration separately:
npm run build -- --configuration staging
npx playwright test
```

`npm run build` does **not** run tokens; there is no prebuild hook. Do not use bare `npx vitest run` (it discovers unconfigured e2e/nested-worktree specs). The local sequence mirrors PR CI's explicit token generation. No local test result proves live persistence or Figma approval.

## Design and release references

[Design guide](docs/agents/design.md) routes visual/interaction work to the relevant frames, board and ADRs. Tokens sync via Figma MCP (Color/SDS Light) into `design/tokens.json`, then `npm run tokens` generates `src/theme/tokens.css`; do not hand-edit output or invent styles. Light mode only.

[Operations guide](docs/agents/operations.md) covers explicit staging selection, provenance, version policy and financial/credential gates. Pushes to feature/bug branches auto-deploy shared staging; **last deployment wins**, so even docs pushes can replace it. Manual dispatch defaults to production. This docs task triggers no deployment. The deployed smoke verifies hosting with auth/API stubs, not genuine login or datastore persistence.

## Document ownership

- [AGENTS.md](AGENTS.md): concise operational rules and conditional task router.
- [GLOSSARY.md](GLOSSARY.md): domain vocabulary, identity/date/amount semantics.
- [CONVENTIONS](docs/CONVENTIONS.md): source/style/testing standards, read before applicable edits.
- [Domain guide](docs/agents/domain.md): contract discovery and unmerged-feature prerequisites.
- [Tracker guide](docs/agents/issue-tracker.md): explicit repo selection, body-file creation, labels and owner closure.
- [ADRs](docs/adr/): historical decisions/rationale; read only those relevant to the task, separating historical state from current code and live evidence.
