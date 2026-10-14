# Visual, interaction and token work

Read before visual/interaction or token changes, including follow-up tweaks. A contract-only/guard change without interaction effects does not require reading every canvas artifact. If uncertain, consult the relevant interaction contract before coding.

1. Discover the relevant live issue, owner approval and frame in José's Guito design duplicate (`UoIK5MnIqDrgfHqMmBZoYk`), **Guito App** page. Never edit the Community original.
2. Draft/update the frame first → José validates → implement from the approved frame. Keep draft, approved, implemented and deployed statuses separate. If José explicitly overrides sequencing, record the exact scope and remaining approval; never relabel a draft approved from code presence.
3. For auth/navigation interactions read [ADR 0011](../adr/0011-auth-gate-all-routes-google-only.md) and the [Guito User Flow board](https://www.figma.com/board/TulG8ptcGlLxQI78GciXr3). The board is live interaction evidence, not a static route inventory. The ADR's avatar/stub statements describe its historical decision point; inspect routes/components and live owner decisions for subsequent implementation.
4. For tokens read [ADR 0010](../adr/0010-figma-token-source-mcp-sync.md), `tools/tokens/figma.json` and [CONVENTIONS](../CONVENTIONS.md). MCP sync writes `design/tokens.json`; `npm run tokens` compiles `src/theme/tokens.css`. `npm run build` alone does not regenerate tokens. Light mode only. REST `tokens:pull` is Enterprise-gated on the recorded plan, not an alternative sync to retry without a plan change.
5. Verify responsive rendered screenshots against approved frames, including loading/error/initial states and interactions. Token binding, code existence and green stub tests alone do not prove visual approval. Keep docs aligned with approved changes; retain rationale in relevant ADRs, not incident logs in AGENTS.

## Artifact pointers, not current approval assertions

- Create Expense canonical frames: mobile `3094:35`, desktop `3094:9704`, validation `3094:9937`, save failure `3094:10011`, voice `3134:10053`. Approved Date/Time layout and precision semantics are recorded in [ADR 0014](../adr/0014-expense-occurrence-lisbon.md); native locale display differences are not layout drift.
- Sign In: mobile `3071:35`, desktop `3080:53`. Historical docs marked approval pending while auth code exists. Recheck owner decisions for visual restyling; this task did not audit live canvas approval.
- Old Bank #61 frames: mobile `3201:270`, desktop `3201:10189`, Accept/date-group design. The newer collapsed inbox/expanded exemplars belong to open UI PR #71; follow [domain prerequisites](domain.md), not these old frames, for reconciliation work.
- Fixed bottom nav/FAB: direct screen children rendered last; clipped content scrolls beneath. Verify long content and initial collapsed/expanded behavior, not just static frames.

Use daisyUI semantic roles / `--guito-*` tokens. No ad-hoc hex; official brand assets retain official colors with source comments. Arbitrary px require approved-frame evidence and no equivalent token. Ask José before token-map changes or color deviations; document each approved deviation in the PR.
