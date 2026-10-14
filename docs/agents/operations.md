# Release, deployment and financial-operation review

Read before version/deployment work, deployed checks, migration/cutover, reporting or any financial operation. This document grants no deployment or write approval.

## Configuration is not live evidence

`environment*.ts` and `angular.json` define API targets/capabilities; [ADR 0013](../adr/0013-build-version-declared-no-tags.md) defines declared versions. Inspect `package.json`, `deploy/version.sh`, `deploy/stamp.sh` and the selected ref's workflows before release work. An approved runtime issue's Proposed version is applied on its branch; recheck base version for conflicts. Issue guito-api#149 explicitly requests **no version bump** for this documentation-only work. Escalate any new policy conflict rather than inventing a release.

Stamp scripts modify environment placeholders: use only for an authorized release verification, build after stamping, verify the resulting stamp, then restore only your temporary placeholder edits. Never restore another session's environment changes.

## Pipeline and shared staging

- `ci.yml` runs npm ci, token generation, Angular build, Vitest and Playwright for PRs. `deploy.yml` stamps/builds/tests and deploys via OIDC role `arn:aws:iam::497087877832:role/guito-ui-deploy`. At the #149 baseline its build labels mention tokens, but its npm build script does not run tokens and the deploy workflow has no separate token step. Do not mistake the label for execution; pipeline correction is outside this docs task.
- Push to master targets production; feature/bug pushes auto-deploy to one shared staging distribution. Even a docs branch push can replace staging. Master is queued without cancellation; staging pushes supersede staging runs; manual dispatch has per-ref lanes, so overlapping manual/push runs can still replace the same target.
- For a **separately approved** review dispatch select staging explicitly; dispatch defaults to production even on feature refs:
  `gh workflow run deploy.yml --repo JoseHRosario/guito-ui --ref <approved-ref> -f environment=staging`
- Shared staging is **last-deployment-wins**, not newest-code-wins. Before inviting owner testing, read the latest successful workflow's ref/SHA/target, inspect subsequent runs and check the served Settings UI/API stamps plus distinguishing route behavior. Local/CI bundle hashes are not deployment provenance. Do not redeploy merely to investigate a missing feature.
- Deployed smoke is separately approved/CI-only by default: `SMOKE_URL=https://guito-staging.web.kerumirembora.com/ npx playwright test e2e/deployed-smoke.spec.ts`. It checks real hosting/assets/SPA deep links but stubs Google, token exchange and expenses; it proves neither real login nor datastore persistence. Local Playwright must have SMOKE_URL unset.

Production entry: https://guito.web.kerumirembora.com/ ; staging entry: https://guito-staging.web.kerumirembora.com/ . URLs are configuration pointers, not a live availability claim.

## Credential and data boundaries

Never print/commit secrets or modify `~/.aws`; José owns credential lifecycle. Use only the approved agent role for authorized AWS operations. Routine code deployments and migrations go through the agreed pipeline; exceptional owner-approved operator actions require explicit scope and evidence, not an invented blanket ban or implicit permission.

No unapproved production/personal writes, deletes, resets, imports, consent changes or migrations. Before any approved integrated test establish which datastore each route exercises from the current API instructions/contracts. Isolated **Sheets** smoke create/list/delete and verified cleanup do not establish Postgres persistence. They never authorize deleting personal records or using `/Smoke/{id}` for Postgres cleanup. Track returned IDs, stop on uncertain outcomes, and follow the approved recovery procedure rather than blindly retrying.

For expense authority/cutover/import/reporting or mutation operations, explicitly read the selected API worktree's root AGENTS and its current expense-cutover, aggregate/security, historical-import or reporting documents as applicable. UI code flags, merged API PRs and old skill snapshots cannot prove served authority. Preserve historical ADR evidence and distinguish owner acceptance from waived/unperformed rehearsals. Report environment, ref/stamp, date, executed checks, unperformed checks and approval source separately.
