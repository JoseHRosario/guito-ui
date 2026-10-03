# AGENTS.md

Rules for AI coding agents working in guito-ui. Overview and architecture story live in [README.md](README.md); domain glossary in [CONTEXT.md](CONTEXT.md); coding conventions (styling, code structure, testing) live in [docs/CONVENTIONS.md](docs/CONVENTIONS.md); UI decision records in [docs/adr/](docs/adr/).

## Commands

```bash
npm run tokens          # regenerate src/theme/tokens.css from design/tokens.json (run after any token change, BEFORE build)
npm run build           # tokens + Angular production build → dist/guito-ui/browser
npm test                # Vitest unit tests (ng test). Do NOT use bare `npx vitest run` — it also picks up e2e/*.spec.ts and fails
npx playwright test     # e2e: Playwright serves dist/guito-ui/browser on :8081 itself
SMOKE_URL=https://guito.web.kerumirembora.com/ npx playwright test e2e/deployed-smoke.spec.ts
                        # deployed smoke: same stubbed sign-in flow against the live site (CI-only by default)
npm start               # ng serve (dev server, :4200)
```

Deploy gate on every PR (CI): tokens → build → Vitest → Playwright. Run all four locally before pushing.

## Git workflow

- `git pull` from `master` first; **one branch per issue**, named `feature/<issue#>-<slug>` or `bug/<issue#>-<slug>` (issue number first — e.g. `feature/9-user-flow`, `bug/40-token-crash`; no `t6a2`-style prefixes on new work). Bugs = something that worked as intended is broken (code regression, wrong behavior, broken config); environment/CI/docs work stays under existing informal prefixes. Work lands via PR, and the PR body **must end with `Closes #N`** so GitHub closes the issue on merge into `master` (staging merges don't close — that's deliberate). **Version (ADR 0013)**: every feature/bug issue carries a mandatory *Proposed version*; the agent bumps the declared version (`package.json` `"version"`) on the branch as part of the work — no git tags, every build stamps `<version>+<UTCts>.<shortsha>`. **Never push to `master`.**
- Agent commits/PRs are authored as the bot: `Meireles (Hermes Agent) <332697001+xungameireles@users.noreply.github.com>`; José's commits stay under his name.
- PRs carry the issue reference; José reviews and merges.
- **Parallel sessions use git worktrees.** The main tree (`/d/srv/projects/guito-ui`) stays on `master` and is shared (José's Windows sync + any agent session) — never check a feature branch out there. For work on a separate issue while another session works, create a worktree **inside the repo** under the gitignored `.worktrees/` dir: `git worktree add .worktrees/<issue#>-<slug> feature/<issue#>-<slug>`. Branches are exclusive per worktree, so sessions cannot collide.
- **Before any blanket `git add -A`, verify `.worktrees/` is ignored on the current branch** (`git check-ignore .worktrees/` — branch history may predate the ignore entry); otherwise prefer adding explicit paths. A branch without the ignore entry would stage an entire nested repo copy.
- **Always run `git branch --show-current` before starting work** — the shared tree may have been switched by another session since you last looked.
- Remove the worktree when its PR merges: `git worktree remove .worktrees/<name> && git worktree prune`.

## Stack (verified — do not suggest older patterns)

- Angular **22.2**: standalone components, signals (`signal`/`computed`/`input.required`), `@if`/`@for` with `track`, `inject()`, `ChangeDetectionStrategy.OnPush` everywhere, no `any`.
- Tailwind **4.3** + daisyUI **5** (user-settled choice — do not re-litigate). TypeScript ~6.0.2, Vitest 5, Playwright 1.63.
- Routing uses `withComponentInputBinding`; route `data` binds to component `input()` by name.

Styling, code-structure, and testing rules live in [docs/CONVENTIONS.md](docs/CONVENTIONS.md).

## Figma design loop

Designs live on the **Guito App** page of the Guito design file (duplicate of Simple Design System, key `UoIK5MnIqDrgfHqMmBZoYk`); the Community original is never edited. Flow: Hermes drafts in Figma (MCP) → José validates → the approved frame is the implement source; design changes happen in Figma, never as code-side drift. Token source is the MCP sync (ADR 0010) — `tools/tokens/pull-figma.mjs` is dead on this plan (`file_variables:read` is Enterprise-only). Token sync regenerates `design/tokens.json` (mapping in `tools/tokens/figma.json`, fileKey = the duplicate).

Current design state on the Guito App page:
- **Workspace** frame (expenses list, mobile + desktop) — José's design, approved and implemented.
- **SignIn** (mobile `node-id=3071-35`) and **SignIn Desktop** (`node-id=3080-53`) — minimalist, Google-only direction; centered logo/tagline/button with the official Google G mark and a bottom trust line. **Pending José's Figma approval** — approval is the implement source for the Sign In screen and the auth route guard. Button is a token-faithful copy of the DS Primary Button (DS instances cannot take an icon child).
- Pinning convention for fixed elements: bottom nav / FAB are direct children rendered last, scrolling content lives in a clipped sub-frame — see the annotated Workspace frame.

## User flow

The **interaction contract** (auth gate → Sign In → Expenses List → Create Expense, sign-out via header avatar) is the FigJam board "Guito User Flow": https://www.figma.com/board/TulG8ptcGlLxQI78GciXr3 — also linked from the Guito App page. Decisions behind it (all routes gated, Google-only, returnUrl) are in **ADR 0011**. Read both before implementing any screen or route; the board is the live artifact — don't copy it into the repo.

## Deployment

- `deploy.yml` on push to `master` (e2e-gated) → OIDC-assumes `arn:aws:iam::497087877832:role/guito-ui-deploy` → S3 sync + CloudFront invalidation → **deployed smoke** (`smoke` job): runs `e2e/deployed-smoke.spec.ts` with `SMOKE_URL` = the live URL — same stubbed sign-in flow, real prod build + CloudFront SPA fallback for deep links (Google/token exchange stay stubbed). `workflow_dispatch` can deploy any branch for review-before-merge. Pushes to `feature/**` / `bug/**` branches AUTO-deploy to staging (`guito-staging.web.kerumirembora.com`, staging build config) — one shared distribution, last push wins, and staging runs can never cancel a production deploy.
- Live demo: https://guito.web.kerumirembora.com/

## Boundaries

- **Never** commit secrets (`.env` holds the Figma PAT and is gitignored); never edit the Community Figma file; never push to `master`.
- **Ask first** before: adding a dependency, deviating from a token color (document each deviation in the PR body), changing the deploy pipeline, or touching the token mapping (`tools/tokens/figma.json`).
- **Always** run the full local suite before pushing; keep this file current — add a rule whenever an agent correction recurs, prune stale ones in the same commit.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on this repo (`gh` CLI); one branch per issue, PR closes #N. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles used as-is: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.
