# Guito UI Code Conventions

Read these rules **before** source, style or test edits, and check them again before committing. [AGENTS.md](../AGENTS.md) owns commands, worktree/PR rules and safety; [README.md](../README.md) owns architecture narrative. Tracker operations use the [tracker guide](agents/issue-tracker.md), not a duplicate branching policy here.

## Styling rules (hard)

- **All styling derives from the token-generated theme.** No ad-hoc hex values, ever. Tailwind arbitrary px (`text-[11px]`, `w-[370px]`) is allowed ONLY when the value comes from an approved Figma frame and the token pipeline has no equivalent — cite the frame in the PR.
- Light mode only (`src/theme/tokens.css` emits `:root` only; extend `tools/tokens/build-tokens.mjs` if dark mode is ever wanted). Never edit `tokens.css` by hand.
- Exception to the no-hex rule: **brand assets** (e.g. the Google G mark) keep their official colors — cite the asset in a code comment.
- Colors go through daisyUI semantic roles (`bg-base-100`, `text-error`, `bg-primary`, …) or the `--guito-*` custom properties. `src/styles.css` must keep `@source not '../e2e'` (Tailwind's scanner mistakes Playwright selectors for variants otherwise).

## Code structure

- **Feature-nested (settled 2026-09-30): `src/app/features/<feature>/{pages,components,models,services}/`** — one folder per feature (`auth/`, `expenses/`, `shell/`, `signin/`); `pages/` holds the feature's top-level screens (html/css/ts/spec — e.g. expenses-page, signin, auth-callback); `components/` holds reusable regions (month-nav, summary-bar; `shell` is the layout chrome, not a screen, so it lives in `features/shell/components/`); models in `models/` (one type per file); HTTP services + specs + feature test fixtures in `services/`.
- `src/app/core/` — cross-cutting plumbing: environment/auth, app bootstrap concerns (warm-up/API version) and router reuse wiring. This is a responsibility boundary, not an exhaustive file allowlist. Anything a single feature consumes lives in that feature; single-consumer helpers fold into their consumer (e.g. the category→icon map is private to `expense-api.ts`), feature-shared pure helpers (e.g. `money.ts`) go in that feature's `services/`.
- `src/app/shared/` — cross-feature presentational pieces (`gicon.ts` inline SVG icons).
- One class/interface/type per file; Angular standalone OnPush components, signals, `inject()`, no `any`.
- Semantic HTML with `aria-label` on navs; no `*ngIf`/`*ngFor`; no raw `ElementRef` DOM manipulation.

## Testing rules

- Unit specs live next to the code (Vitest, jsdom). jsdom applies no CSS: both responsive branches render in tests — use `:visible` scoping in e2e and duplicate-tolerant counts in unit tests.
- **The unit-test builder runs vitest with `isolate: false`** — spec files in the same worker share one environment, so `vi.stubGlobal` stubs (storage, location, fetch) leak into whatever file the worker runs next. Any spec that stubs globals must `vi.unstubAllGlobals()` in an `afterEach` (file scheduling can shift when new specs are added, turning a latent leak into an unrelated file's failure — see PR #33).
- Restore spies with `vi.restoreAllMocks()` in `afterEach`, remove manually installed browser globals/listeners and owned session keys, and reset TestBed/HTTP expectations after failures. Do not assume another spec's storage stub implements `.clear()`.
- Keep CI/unit/browser transports hermetic: no credentials, live Sheets/Postgres, real OAuth, bank consent or financial writes. Test exact amounts/date/identity through public HTTP and rendered seams; fake transport success is not live persistence or visual approval.
- e2e specs in `e2e/` against the built app; every `data-testid` must have an assertion using it.
- Route-data-bound inputs must have defaults (required inputs throw NG0950 before the router binding lands in tests).
