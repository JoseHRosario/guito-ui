# Guito UI

The web frontend of **Guito**, a personal expense tracker: control expenses and maximize savings. This SPA consumes the [guito-api](https://github.com/JoseHRosario/guito-api) HTTP API and is designed screen-by-screen in Figma before any code is written.

> Live demo: https://dna69cy69n7jb.cloudfront.net/ (deployed from `master`; data is currently stubbed in-app)

> Status (2026): MVP under revival. The app shell, the latest-expenses screen, and the Google auth layer (env config, PKCE `AuthService`, `/auth/callback`) are implemented against approved Figma frames / settled decisions; next up: the Sign In screen (drafted in Figma, pending approval) and the route guard. Live API wiring follows (guito-api#9).

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
  core/       models + pure functions (money formatting, day grouping), stub data
  core/auth/  Google PKCE session: AuthService (signals), session storage, pkce
  shell/      header, nav, bottom navigation, footer
  features/   one folder per screen (expenses/, auth/ — callback screen today)
  shared/     cross-feature components (inline SVG icon set)
  theme/      tokens.css — GENERATED, never hand-edited
design/       tokens.json — style-dictionary source of the theme
tools/tokens/ token pipeline: build-tokens.mjs, figma.json (role→variable map)
e2e/          Playwright specs
docs/adr/     UI decision records (0001–0010+)
```

## Deployment

`.github/workflows/`: `ci.yml` runs the full gate (tokens → build → Vitest → Playwright) on every PR; `deploy.yml` on push to `master` syncs `dist/` to S3 and invalidates CloudFront — AWS authentication is OIDC-only (role `guito-ui-deploy`, no long-lived keys). Any branch can be deployed on demand via `workflow_dispatch` for review-before-merge.

## Docs

- [CONTEXT.md](CONTEXT.md) — glossary (design file, design loop, token sync)
- [docs/adr/](docs/adr/) — decisions (token source = Figma MCP sync, …)
- [AGENTS.md](AGENTS.md) — rules for AI coding agents
- [guito-api](https://github.com/JoseHRosario/guito-api) — the backend (issues for both repos live there)
