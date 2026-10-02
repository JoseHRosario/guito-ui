# Guito UI Code Conventions

Rules that apply to every PR in this repo. AGENTS.md carries commands, workflow,
architecture story, Figma loop, and deployment; this file carries the coding
conventions. Agents must check this list before committing.

## Branching

One branch per issue, cut from `master`, named with the issue number first:

- Features and new work: `feature/<issue#>-<slug>` (e.g. `feature/9-user-flow`)
- Bugs — something that worked as intended is broken (code regression, wrong
  behavior, broken config): `bug/<issue#>-<slug>` (e.g. `bug/40-token-crash`)
- Environment/CI/docs work stays under the existing informal prefixes (`chore/`,
  `docs/`) — not formalized further.

The PR body must end with `Closes #N`. Never push directly to `master`.

## Styling rules (hard)

- **All styling derives from the token-generated theme.** No ad-hoc hex values, ever. Tailwind arbitrary px (`text-[11px]`, `w-[370px]`) is allowed ONLY when the value comes from an approved Figma frame and the token pipeline has no equivalent — cite the frame in the PR.
- Light mode only (`src/theme/tokens.css` emits `:root` only; extend `tools/tokens/build-tokens.mjs` if dark mode is ever wanted). Never edit `tokens.css` by hand.
- Exception to the no-hex rule: **brand assets** (e.g. the Google G mark) keep their official colors — cite the asset in a code comment.
- Colors go through daisyUI semantic roles (`bg-base-100`, `text-error`, `bg-primary`, …) or the `--guito-*` custom properties. `src/styles.css` must keep `@source not '../e2e'` (Tailwind's scanner mistakes Playwright selectors for variants otherwise).

## Code structure

- **Feature-nested (settled 2026-09-30): `src/app/features/<feature>/{pages,components,models,services}/`** — one folder per feature (`auth/`, `expenses/`, `shell/`, `signin/`); `pages/` holds the feature's top-level screens (html/css/ts/spec — e.g. expenses-page, signin, auth-callback); `components/` holds reusable regions (month-nav, summary-bar; `shell` is the layout chrome, not a screen, so it lives in `features/shell/components/`); models in `models/` (one type per file); HTTP services + specs + feature test fixtures in `services/`.
- `src/app/core/` — ONLY cross-feature plumbing: `app-environment.ts` and `core/auth/` (moves under `features/auth/` when it gains components). Anything a single feature consumes lives in that feature; single-consumer helpers fold into their consumer (e.g. the category→icon map is private to `expense-api.ts`), shared pure helpers (e.g. `money.ts`) go in the feature's `services/`.
- `src/app/shared/` — cross-feature presentational pieces (`gicon.ts` inline SVG icons).
- Semantic HTML with `aria-label` on navs; no `*ngIf`/`*ngFor`; no raw `ElementRef` DOM manipulation.

## Testing rules

- Unit specs live next to the code (Vitest, jsdom). jsdom applies no CSS: both responsive branches render in tests — use `:visible` scoping in e2e and duplicate-tolerant counts in unit tests.
- **The unit-test builder runs vitest with `isolate: false`** — spec files in the same worker share one environment, so `vi.stubGlobal` stubs (storage, location, fetch) leak into whatever file the worker runs next. Any spec that stubs globals must `vi.unstubAllGlobals()` in an `afterEach` (file scheduling can shift when new specs are added, turning a latent leak into an unrelated file's failure — see PR #33).
- e2e specs in `e2e/` against the built app; every `data-testid` must have an assertion using it.
- Route-data-bound inputs must have defaults (required inputs throw NG0950 before the router binding lands in tests).
