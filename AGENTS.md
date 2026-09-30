# AGENTS.md

Rules for AI coding agents working in guito-ui. Overview and architecture story live in [README.md](README.md); domain glossary in [CONTEXT.md](CONTEXT.md); UI decision records in [docs/adr/](docs/adr/).

## Commands

```bash
npm run tokens          # regenerate src/theme/tokens.css from design/tokens.json (run after any token change, BEFORE build)
npm run build           # tokens + Angular production build → dist/guito-ui/browser
npm test                # Vitest unit tests (ng test). Do NOT use bare `npx vitest run` — it also picks up e2e/*.spec.ts and fails
npx playwright test     # e2e: Playwright serves dist/guito-ui/browser on :8081 itself
SMOKE_URL=https://dna69cy69n7jb.cloudfront.net/ npx playwright test e2e/deployed-smoke.spec.ts
                        # deployed smoke: same stubbed sign-in flow against the live site (CI-only by default)
npm start               # ng serve (dev server, :4200)
```

Deploy gate on every PR (CI): tokens → build → Vitest → Playwright. Run all four locally before pushing.

## Git workflow

- `git pull` from `master` first; **one feature branch per issue**, named `feature/<issue#>-<slug>` (issue number first — e.g. `feature/9-user-flow`; no `t6a2`-style prefixes on new work). Work lands via PR, and the PR body **must end with `Closes #N`** so GitHub closes the issue on merge into `master` (staging merges don't close — that's deliberate). **Never push to `master`.**
- Agent commits/PRs are authored as the bot: `Meireles (Hermes Agent) <332697001+xungameireles@users.noreply.github.com>`; José's commits stay under his name.
- PRs carry the issue reference; José reviews and merges.

## Stack (verified — do not suggest older patterns)

- Angular **22.2**: standalone components, signals (`signal`/`computed`/`input.required`), `@if`/`@for` with `track`, `inject()`, `ChangeDetectionStrategy.OnPush` everywhere, no `any`.
- Tailwind **4.3** + daisyUI **5** (user-settled choice — do not re-litigate). TypeScript ~6.0.2, Vitest 5, Playwright 1.63.
- Routing uses `withComponentInputBinding`; route `data` binds to component `input()` by name.

## Styling rules (hard)

- **All styling derives from the token-generated theme.** No ad-hoc hex values, ever. Tailwind arbitrary px (`text-[11px]`, `w-[370px]`) is allowed ONLY when the value comes from an approved Figma frame and the token pipeline has no equivalent — cite the frame in the PR.
- Light mode only (`src/theme/tokens.css` emits `:root` only; extend `tools/tokens/build-tokens.mjs` if dark mode is ever wanted). Never edit `tokens.css` by hand.
- Exception to the no-hex rule: **brand assets** (e.g. the Google G mark) keep their official colors — cite the asset in a code comment.
- Colors go through daisyUI semantic roles (`bg-base-100`, `text-error`, `bg-primary`, …) or the `--guito-*` custom properties. `src/styles.css` must keep `@source not '../e2e'` (Tailwind's scanner mistakes Playwright selectors for variants otherwise).

## Code structure

- **Feature-nested (settled 2026-09-30): `src/app/features/<feature>/{components,models,services}/`** — one folder per feature (`auth/`, `expenses/`, `shell/`, `signin/`); components per region in `components/`, feature models in `models/` (one type per file), HTTP services + their specs + feature test fixtures in `services/`.
- `src/app/core/` — cross-feature pure helpers and plumbing that no single feature owns: `money.ts` (formatting via `Intl.NumberFormat('pt-PT')`), `group-by-day.ts`, `expense-summary.ts`, `category-icon.ts`, `app-environment.ts`, and `core/auth/` (auth plumbing; will move under `features/auth/` when it gains components). Core helpers may import feature models (`Expense`, `MonthSummary`) — the inverted edge is deliberate.
- `src/app/shared/` — cross-feature presentational pieces (`gicon.ts` inline SVG icons).
- Semantic HTML with `aria-label` on navs; no `*ngIf`/`*ngFor`; no raw `ElementRef` DOM manipulation.

## Testing rules

- Unit specs live next to the code (Vitest, jsdom). jsdom applies no CSS: both responsive branches render in tests — use `:visible` scoping in e2e and duplicate-tolerant counts in unit tests.
- e2e specs in `e2e/` against the built app; every `data-testid` must have an assertion using it.
- Route-data-bound inputs must have defaults (required inputs throw NG0950 before the router binding lands in tests).

## Figma design loop

Designs live on the **Guito App** page of the Guito design file (duplicate of Simple Design System, key `UoIK5MnIqDrgfHqMmBZoYk`); the Community original is never edited. Flow: Hermes drafts in Figma (MCP) → José validates → the approved frame is the implement source; design changes happen in Figma, never as code-side drift. Token source is the MCP sync (ADR 0010) — `tools/tokens/pull-figma.mjs` is dead on this plan (`file_variables:read` is Enterprise-only). Token sync regenerates `design/tokens.json` (mapping in `tools/tokens/figma.json`, fileKey = the duplicate).

Current design state on the Guito App page:
- **Workspace** frame (expenses list, mobile + desktop) — José's design, approved and implemented.
- **SignIn** (mobile `node-id=3071-35`) and **SignIn Desktop** (`node-id=3080-53`) — minimalist, Google-only direction; centered logo/tagline/button with the official Google G mark and a bottom trust line. **Pending José's Figma approval** — approval is the implement source for the Sign In screen and the auth route guard. Button is a token-faithful copy of the DS Primary Button (DS instances cannot take an icon child).
- Pinning convention for fixed elements: bottom nav / FAB are direct children rendered last, scrolling content lives in a clipped sub-frame — see the annotated Workspace frame.

## User flow

The **interaction contract** (auth gate → Sign In → Expenses List → Create Expense, sign-out via header avatar) is the FigJam board "Guito User Flow": https://www.figma.com/board/TulG8ptcGlLxQI78GciXr3 — also linked from the Guito App page. Decisions behind it (all routes gated, Google-only, returnUrl) are in **ADR 0011**. Read both before implementing any screen or route; the board is the live artifact — don't copy it into the repo.

## Deployment

- `deploy.yml` on push to `master` (e2e-gated) → OIDC-assumes `arn:aws:iam::497087877832:role/guito-ui-deploy` → S3 sync + CloudFront invalidation → **deployed smoke** (`smoke` job): runs `e2e/deployed-smoke.spec.ts` with `SMOKE_URL` = the live URL — same stubbed sign-in flow, real prod build + CloudFront SPA fallback for deep links (Google/token exchange stay stubbed). `workflow_dispatch` can deploy any branch for review-before-merge.
- Live demo: https://dna69cy69n7jb.cloudfront.net/

## Boundaries

- **Never** commit secrets (`.env` holds the Figma PAT and is gitignored); never edit the Community Figma file; never push to `master`.
- **Ask first** before: adding a dependency, deviating from a token color (document each deviation in the PR body), changing the deploy pipeline, or touching the token mapping (`tools/tokens/figma.json`).
- **Always** run the full local suite before pushing; keep this file current — add a rule whenever an agent correction recurs, prune stale ones in the same commit.
