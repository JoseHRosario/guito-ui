# Project Context & Coding Standards for AI Agents

You are an expert AI developer specialized in TypeScript, modern Angular, and scalable web architecture. You write clean, maintainable, performant, and type-safe code. Follow these project instructions implicitly.

---

## 1. Project Overview & Commands
*   **Framework:** Angular (v18+) using Standalone Components and Signals.
*   **Build Command:** `npm run build` or `ng build`
*   **Test Command:** `npm run test` or `ng test`
*   **Lint Command:** `npm run lint` or `ng lint`

---

## 2. Core Angular Architecture Standards

### 2.1 Standalone Components & Architecture
*   **No NgModules:** Always create Standalone Components, Directives, and Pipes.
*   **File Structure:** Group by feature modules using a clean architecture (e.g., `features/`, `shared/`, `core/`).
*   **Control Flow:** Always use the modern `@if`, `@for`, `@switch` template syntax. Never use `*ngIf` or `*ngFor`.
*   **Deferrable Views:** Utilize `@defer` blocks for heavy or non-critical components to optimize initial bundle sizes.

### 2.2 Modern Dependency Injection (DI)
*   **`inject()` Function:** Use the `inject()` function for dependency injection instead of traditional constructor injection.
    ```typescript
    // Correct
    export class MyComponent {
      private myService = inject(MyService);
    }
    ```
*   **Singleton Services:** Use `@Injectable({ providedIn: 'root' })` for global services. 

### 2.3 Reactivity & State Management (Signals)
*   **Signals First:** Prefer Angular Signals (`signal`, `computed`, `effect`) over RxJS for synchronous state management and UI state.
*   **Component Inputs/Outputs:** Use the new Signal-based inputs and outputs APIs:
    ```typescript
    // Correct
    export class UserComponent {
      userId = input.required<string>(); // Signal-based input
      userUpdated = output<User>();       // Modern output API
    }
    ```
*   **RxJS Interoperability:** Use `rxjs-interop` (`toSignal`, `toObservable`) when integrating with asynchronous data streams (e.g., HttpClient). Always provide an `DestroyRef` or `allowSignalWrites` inside effects where necessary.

### 2.4 Performance & Change Detection
*   **Zoneless/OnPush:** Ensure components default to `changeDetection: ChangeDetectionStrategy.OnPush`. If the project configuration allows, optimize for Zoneless Angular applications.
*   **Track By Equivalents:** Always use the `track` expression inside `@for` blocks to prevent unnecessary DOM re-renders.

---

## 3. TypeScript & Code Style Guidelines

*   **Strict Typing:** Never use `any`. Always define explicit interfaces or types for API contracts and component states.
*   **Immutability:** Treat state as immutable. Use spread operators or pure functions instead of mutating objects directly.
*   **CamelCase Functions:** Always use `camelCase` for function and variable names, and `PascalCase` for classes, interfaces, and enums.
*   **Imports:** Clean up unused imports automatically and prioritize path aliases (e.g., `@core/*`, `@shared/*`) defined in `tsconfig.json`.

---

## 4. Testing & Quality Assurance

*   **Component Testing:** Prefer using `ComponentHarness` for interacting with UI components in tests to keep them resilient to DOM changes.
*   **Isolated Service Tests:** Test services in isolation by mocking dependencies using basic spies or testing utility libraries.
*   **Mocking HTTP:** Utilize `HttpTestingController` for robust backend integration testing.

---

## 5. Security & Accessibility (a11y)

*   **Security:** Avoid raw DOM manipulation via `ElementRef.nativeElement`. Never bypass built-in sanitization unless absolutely required via `DomSanitizer`.
*   **Semantic HTML:** Use native semantic HTML elements (`<button>`, `<main>`, `<nav>`) to ensure accessibility.
*   **ARIA Attributes:** Ensure appropriate `aria-*` tags and keyboard navigation patterns are supported in custom interactive components.

---

## 6. Figma Design Loop

The UI is defined in Figma and implemented through the design loop. File: **Guito design file**, key `UoIK5MnIqDrgfHqMmBZoYk` (José's duplicate of "Simple Design System (Community)"; the Community original is read-only and never edited). All app designs live on the dedicated **Guito App** page.

*   **Design loop:** Hermes drafts the screen on the Guito App page via the Figma MCP → José validates/edits in Figma → approval = the implement source. Design changes happen in Figma, never as code-side drift.
*   **Token sync:** at implement time the agent reads the file's 'Design Tokens' variables via the Figma MCP and regenerates `design/tokens.json` (style-dictionary shape; mapping in `tools/tokens/figma.json`, fileKey = the duplicate). The REST pull (`tools/tokens/pull-figma.mjs`) is dead on this plan — `file_variables:read` is Enterprise-only. Token-source decision: guito-api ADR-0010.
*   **Styling convention:** all styling derives from the token-generated theme (`npm run tokens` → `src/theme/tokens.css`); no ad-hoc hex/px values. Light mode only.
*   **Git workflow:** always pull from master, then create a feature branch per issue. Never push to master — PRs only (CI gates: tokens + build + Vitest + Playwright).
