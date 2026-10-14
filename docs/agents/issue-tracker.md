# GitHub tracker operations

Read before issue/PR writes or triage. Use `gh` with an **explicit repository**: UI-local issues use `JoseHRosario/guito-ui`; shared/product work often lives in `JoseHRosario/guito-api`. Inspect the linked issue before choosing. GitHub issue/PR numbers share a namespace within a repository, not across repositories.

## Read first

```sh
gh api repos/JoseHRosario/guito-api/issues/149
gh api --paginate repos/JoseHRosario/guito-api/issues/149/comments
gh pr view <N> --repo JoseHRosario/guito-ui --json state,headRefOid,body
gh pr diff <N> --repo JoseHRosario/guito-ui
gh label list --repo JoseHRosario/guito-ui
```

Use REST issue/comment reads to avoid the Projects-classic GraphQL `projectCards` failure in `gh issue view --comments`. Read the complete body, labels and paginated owner decisions, not a search preview. Resolve ambiguous numbers via the issue REST response (`pull_request` identifies PRs).

## Bodies and explicit labels

GitHub web forms live in `.github/ISSUE_TEMPLATE/`. **Scripted creates do not inherit form labels or fields.** Construct a complete Markdown body in a UTF-8 file with a file-writing tool, then use `--body-file`; do not interpolate shell heredocs/backticks or pass multiline content through `while read`/`--body -`.

- Feature fields: What, Figma frame (for visual work), Proposed version, Acceptance criteria (checkboxes), Out of scope, Open questions.
- Bug fields: What broke, Steps to reproduce, Proposed version, Acceptance criteria, Suspected cause / affected area.
- Docs/infra work may use a complete blank issue when neither form fits. Issue #149 explicitly says no runtime version bump.
- List labels in the **target** repo first, then set existing labels explicitly. Do not assume a `task` or wayfinder label exists. Triage roles use the [label map](triage-labels.md); creating missing labels is itself a deliberate authorized tracker write.

Examples below are mutations; execute only within the approved tracker task:

```sh
gh issue create --repo JoseHRosario/guito-ui --title '<title>' --label feature --body-file <body.md>
gh issue edit <N> --repo JoseHRosario/guito-ui --body-file <body.md>
gh issue comment <N> --repo JoseHRosario/guito-ui --body-file <comment.md>
gh issue edit <N> --repo JoseHRosario/guito-ui --add-label '<existing-label>'
```

After every create/edit/comment/label write, reread the exact target/body/labels through REST. Check command success before reusing its output; never replace an issue/comment with upstream error JSON. If single-comment reads fail, read the list endpoint and locate the returned ID. Avoid duplicate comments on uncertain outcomes.

## Branch, PR and closure

[AGENTS](../../AGENTS.md) owns mandatory per-issue worktrees, branch names, explicit staging, attribution and owner merge. Before further pushes verify the PR remains open and its remote head matches the expected ref. PR bodies use reviewed body files too.

Same-repo implementation PRs may end `Closes #N` (closes only on merge to default `master`). **Cross-repo UI work uses `JoseHRosario/guito-api#N` with José closing it manually**; a bare UI `Closes #N` targets the wrong repository. Component PRs for cross-repo #149 must not auto-close it before repository/skill/trial evidence is complete. Docs-only follow-ups on an already closed issue use references, not misleading closing keywords. Existing form descriptions summarize only the same-repo case; this guide supplies the cross-repo rule.

Tick only acceptance boxes backed by executed evidence; post one evidence line per criterion and name remaining gates. Leave issue closure and PR merge to José unless explicitly delegated. Do not change waived/unperformed checks into passed tests.

## Triage and wayfinding

**PRs as a request surface: no.** Use issues for published specifications; fetch full body/comments for relevant tickets. List open issues with explicit repo/labels and JSON fields as needed; paginate API discovery when totals exceed a page.

For a wayfinder task, keep the map issue's Notes / Decisions-so-far / Fog, link child issues with native sub-issues (or a map task list plus `Part of <repo>#N` fallback), and use existing `wayfinder:map` / `wayfinder:<type>` labels only after checking them. Preserve assignment/ownership.

Native dependencies are the canonical blocker relation. An approved dependency write uses:

`gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-database-id>`

Obtain `.id` from the blocker's REST issue response, not its issue number or node ID. If native dependencies are unavailable, use explicit `Blocked by: <repo>#N` references. The frontier is the first open unassigned child in map order with no open blockers (`issue_dependencies_summary.blocked_by`, or verified fallback links). Claim only an authorized task using assignment, then reread ownership. Resolve by posting evidence and a context pointer to map Decisions-so-far; José's closure gate still applies. Do not close issues merely because a generic skill's recipe says to.
