# Guito UI agent router

Human overview: [README.md](README.md). Read the task-scoped documents below **before** the corresponding edits; links do not load themselves. Cross-repo sessions explicitly read each target worktree's root AGENTS.

## Commands

Use Node 22 (CI) and npm; `npm ci` installs the locked dependencies. In an owned worktree:

```sh
npm run tokens                 # design/tokens.json → src/theme/tokens.css
npm run build                  # Angular production build; DOES NOT run tokens
npm test                       # ng test / Vitest; not bare npx vitest run
npx playwright test            # requires built dist/guito-ui/browser; serves :8081
npm start                      # ng serve on :4200; development API configuration
```

Run tokens → build → unit → Playwright before pushing. Keep local checks hermetic: stub API/Google/speech/bank transports, with no network credentials or live Sheets/Postgres dependencies. Deployed checks require separate approval; green stubs are not persistence, visual approval or production acceptance.

## Read by task

| Before… | Read… |
|---|---|
| Angular, template, style or test edits | [CONVENTIONS](docs/CONVENTIONS.md) (full coding/testing rules) |
| Domain, DTO, amount/date/identity changes | [GLOSSARY](GLOSSARY.md), [domain guide](docs/agents/domain.md), [ADR 0014](docs/adr/0014-expense-occurrence-lisbon.md) |
| Visual/interaction or token changes | [design guide](docs/agents/design.md), [ADR 0010](docs/adr/0010-figma-token-source-mcp-sync.md); auth/navigation interactions also [ADR 0011](docs/adr/0011-auth-gate-all-routes-google-only.md) |
| Auth/guard or API transport edits | [domain guide](docs/agents/domain.md), [ADR 0011](docs/adr/0011-auth-gate-all-routes-google-only.md); consult design only if interaction changes |
| Expense edit/delete or bank reconciliation | [domain guide](docs/agents/domain.md), including live PR/contract prerequisites (not yet merged here) |
| Version, deployment, storage/cutover, financial operations or deployed verification | [operations guide](docs/agents/operations.md), [ADR 0013](docs/adr/0013-build-version-declared-no-tags.md); explicitly read API worktree instructions/contracts for backend operations |
| Issue/PR creation, updates or triage | [tracker](docs/agents/issue-tracker.md); triage also [label map](docs/agents/triage-labels.md) |

## Essential conventions

- Angular 22.2, TypeScript ~6.0.2, Tailwind 4.3 + daisyUI 5 (settled). Use standalone OnPush components, signals, `inject()`, typed code without `any`, and `@if`/`@for` with stable tracking.
- One class/interface/type per file. Feature code belongs under `features/<feature>/{pages,components,models,services}`; core owns cross-cutting wiring. Route data binds to defaulted `input()` via `withComponentInputBinding`.
- Visual/interaction changes require Figma draft → José's approval → implementation from the approved frame, including follow-up tweaks. Code does not prove approval. Theme styles come from tokens; never hand-edit generated CSS.
- Preserve exact decimal text, numeric durable Expense IDs and Lisbon `bookingDate`. Never invent identity from ordinals or use audit dates as occurrence fallbacks.

## Git and ownership

- Check `git branch --show-current` and `git status --short` before work. Every issue, sequential or parallel, uses its own `.worktrees/<issue#>-<slug>` worktree and `feature/<issue#>-<slug>` or `bug/<issue#>-<slug>` branch from refreshed `origin/master`. Inspect ownership before fetching/creating; never switch, reset or pull over the shared dirty root.
- Verify `.worktrees/` and dependency symlinks are ignored; stage **explicit owned paths only**, never blanket-add. Preserve other sessions' staged/untracked files.
- PR → José reviews/merges; never push master. Agent attribution: `Meireles (Hermes Agent) <332697001+xungameireles@users.noreply.github.com>`; leave José's identity unchanged. Check a PR is still open before further pushes; remove only your worktree after merge.
- Same-repo implementation PRs may end `Closes #N`. Cross-repo work references `JoseHRosario/guito-api#N`, never bare closing keywords. No component PR auto-closes the shared docs issue; José owns final disposition. Version policy is ADR 0013; issue #149 explicitly preserves application versions for docs-only work.

## Boundaries

- **Always:** retain auth/privacy, exact financial contracts and owner gates. Use only the approved agent AWS role for authorized operations; routine deployments/migrations go through the agreed pipeline. Select staging explicitly for separately approved UI review dispatches and verify shared-staging provenance (last deployment wins).
- **Ask first:** dependencies, token-map changes, token-color deviations (cite each approved deviation in the PR), pipeline changes, exceptional operator actions, live financial writes/deletes/imports/resets or production operations.
- **Never:** commit or print secrets, modify files under `~/.aws` (José owns credentials), mutate personal/production financial data without explicit approval, edit the Community Figma original, or treat isolated Sheets smoke cleanup as permission to delete personal/Postgres records.

## Living doc

Retain rules for recurring corrections; prune obsolete/duplicate rules with the invalidating change. Keep detail task-scoped, validate routing links and measure entry-point size. The ~1,000–1,500-token target is editorial, not a model limit; preserve safety over a hard count.
