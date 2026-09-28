# Context & Glossary (guito-ui)

- **Guito design file** — José's duplicate of the "Simple Design System (Community)" Figma file, key `UoIK5MnIqDrgfHqMmBZoYk` (owner José). The Community original is read-only source and never edited. App designs live on its dedicated **Guito App** page. See ADR 0010.
- **Design loop** — the UI workflow: Hermes drafts a screen on the Guito App page via the Figma MCP → José validates/edits in Figma → approval becomes the implement source. Design changes happen in Figma, never as code-side drift.
- **Token sync (MCP)** — the process writing `design/tokens.json` from the design file's 'Color' variables (SDS Light mode), read via the Figma MCP (see ADR 0010). The REST/pull path is impossible on this plan: `file_variables:read` is Enterprise-only. The role→variable mapping lives in `tools/tokens/figma.json`.
