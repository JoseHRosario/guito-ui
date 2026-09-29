# Auth gate: all routes gated, Google-only sign-in, returnUrl redirect

Follows the guito-api auth ADRs (Google PKCE for humans + X-Api-Key for agents). This ADR covers the **UI-side** interaction model, settled while drafting the user flow board (guito-ui#7, FigJam "Guito User Flow").

**Decision**:

- **All routes are gated.** An unauthenticated visit to *any* route redirects to Sign In. There is no public dashboard: an expense tracker is personal data, and a public dashboard variant would mean designing a whole extra screen with no user value for the MVP.
- **Sign-in is Google only** (PKCE), matching guito-api's settled auth design. No email/password branch is drawn or planned; adding one later is a new decision.
- **Redirect behavior**: unauthenticated deep links redirect to Sign In carrying a `returnUrl`; after successful sign-in the user returns to the originally requested route. Chosen over "always land on Expenses List" because the plumbing is small and preserves intent.
- **Sign-out affordance**: a header avatar menu (authenticated state) — it does **not exist yet**; the current canvas frames carry an avatar *placeholder* (dark circle, "JD" initials) in both Mobile and Desktop headers where the unauthenticated mock previously showed a "Sign In" button. The real avatar + menu element is designed when auth lands.
- **Post-save behavior**: Create Expense returns to Expenses List; no expense detail screen for the MVP (the list row is the confirmation).

**Considered options**:
- Public dashboard, gated Expenses/Budgets/Settings — rejected: no anonymous use case, costs a screen.
- Always land on Expenses List after sign-in (no returnUrl) — rejected for now; revisit only if returnUrl plumbing proves to drag.
- Sign-out in a Settings tab — rejected: the header avatar is the conventional affordance and the flow board already routes sign-out through it.

**Consequences**:
- The canvas frames now depict the *authenticated* header state; the unauthenticated state (Sign In button) lives only in the flow board until the Sign In screen is designed.
- The avatar menu is a documented gap: any implementation issue that ships auth must design it or ship the placeholder with sign-out stubbed.
- The flow board ([FigJam](https://www.figma.com/board/TulG8ptcGlLxQI78GciXr3)) is the interaction contract; scope for iteration 1 is the core loop only (auth → Expenses → Create Expense). Dashboard/Budgets/Settings routes are stubs and join the flow in future iterations.
