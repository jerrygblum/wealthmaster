# Frontend development

The frontend uses React, TypeScript and Vite. ESLint checks correctness and accessibility; Prettier owns formatting. Install with `npm ci`.

| Command                                                           | Purpose                                                                |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`                                                     | Start the development server                                           |
| `npm run lint`                                                    | Check source, tests, browser journeys and configuration; warnings fail |
| `npm run lint:fix`                                                | Apply safe lint fixes                                                  |
| `npm run format`                                                  | Format frontend files                                                  |
| `npm run format:check`                                            | Check formatting without rewriting files                               |
| `npm run typecheck`                                               | Check application and tooling/browser-test TypeScript                  |
| `npm run test:related -- src/pages/categories/CategoriesPage.tsx` | Run only tests importing affected files (two workers)                  |
| `npm test`                                                        | Run component and API tests                                            |
| `npm run test:tooling`                                            | Verify hook, promise, accessibility and architecture rules             |
| `npm run build`                                                   | Typecheck and build production assets                                  |
| `npm run test:e2e`                                                | Run desktop and mobile browser journeys                                |

The repository recommends the VS Code ESLint and Prettier extensions and enables format-on-save. Prettier requires a configuration, so its frontend configuration does not format backend files. Other editors can use the same configuration and npm commands. There are no commit hooks. CI checks lint, formatting and tooling rules before building and testing.

TypeScript 6.0.3 is pinned to stay within typescript-eslint's supported compiler range. ESLint and its plugins are pinned as a compatible set; update their peer dependencies together. Do not bypass compatibility with forced installs. Formatting excludes generated lockfiles, build output, dependencies and test artifacts.

## Atomic design

| Layer                          | Responsibility                                                           | Examples                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `components/atoms`             | Native accessible controls and small presentation primitives             | Button, Input, Select, Checkbox, Radio, Link, Badge                                             |
| `components/molecules`         | Small reusable compositions                                              | Field, ActionGroup, SegmentedControl, Confirmation, feedback                                    |
| `components/organisms`         | Controlled feature sections composed from lower layers                   | Navigation, workspace heading, account/category forms, spending hierarchy, monthly expectations |
| `components/templates`         | Layout and composition slots without data fetching                       | ApplicationLayout, WorkspaceLayout, AuthenticationLayout                                        |
| `pages`                        | Route and feature controllers that compose templates and organisms       | Accounts, Categories, Spending, sign-in and MFA controllers                                     |
| `hooks`                        | Page state, API requests, mutations and lifecycle handling               | Session restoration, stale-form recovery, report loading                                        |
| `services` / `types` / `utils` | Request implementation, DTO/prop contracts and pure presentation helpers | API client, exact decimal formatting                                                            |

Organisms are grouped by feature. Place tests alongside the component or controller they exercise. A component does not need a new wrapper at every layer: extract a composition when it has a clear UI responsibility or reuse.

Atoms cannot import higher layers. Molecules may compose atoms; organisms may compose atoms/molecules; templates may compose these layers. Same-layer composition is allowed. Pages orchestrate the hierarchy. ESLint rejects UI-layer imports of services, hooks and page controllers, including re-exports and dynamic imports. Inject typed data, callbacks and child slots instead. UI view-model contracts are type-only; they do not import hooks at runtime.

Financial rules remain on the backend. Display exact monetary strings through presentation helpers; no monetary calculation uses binary floating point. Keep session expiry, pending/error states, retained failed input and optimistic versions in feature hooks. Shared controls preserve native semantics, refs and keyboard access. Use Button variants instead of duplicating control styles. Focus newly opened forms explicitly through Input's `focusOnMount` prop.

Styles are split into tokens, base rules and component rules. ApplicationLayout places one icon sign-out action beside the brand; useApp owns its pending/error/session state. WorkspaceHeading provides compact titles and optional subtitles for signed-in pages; workspace toolbar sizing is scoped away from editing forms. Account cards and category/spending tables share the compact-action icon style (32px desktop, 40px mobile), with accessible labels and tooltips. Spending uses a Month/Year toggle, native period field and icon arrows; valid period changes load automatically, with no Show period or Refresh button. Login and MFA challenge layouts retain their existing sizing. CategoryForm composes the shared fields and saves category details through its page controller; Settings exposes owner currency preferences. Preserve accessible names and selectors when extracting components, and verify affected journeys on desktop and mobile.

Browser tests require the dedicated synthetic database described in the root README; never run fixtures against production data. The CI matrix runs development and production backend profiles.

## Fast development checks

During edits, use `npm run test:watch` or `npm run test:related -- <changed-source-files>`. Related-file selection follows imports; include changed shared services/hooks as well as page files. For this category/currency feature: `npm run test:related -- src/pages/categories/CategoriesPage.tsx src/pages/auth/PreferencesPanel.tsx src/pages/auth/SecuritySettings.tsx src/pages/spending/SpendingPage.tsx`. Two workers avoid local oversubscription.

Before completing changes, run lint, format:check, typecheck and affected tests sequentially. For backend unit changes, use `mvn --batch-mode -Dtest=SpendingPeriodTest,CurrencyPolicyTest test` in backend. Persistence/migration changes also warrant focused integration checks using a disposable database, as documented in the root README. With dependencies already cached, add Maven `--offline` to avoid registry lookup delays. Do not run heavy backend, frontend and browser suites concurrently.

Browser journeys are updated with the feature but run in CI by default. CI retains full backend/frontend tests, production build, tooling checks and desktop/mobile browser coverage under dev and prod profiles. Report local checks separately from CI results; a passing focused local suite does not imply CI has run. There are no skipped checks or timeout increases to accelerate the workflow.

Displayed monetary amounts and spending percentages are rounded to two decimal places using decimal-string arithmetic (half up). Editable fields, API values, calculations and chart proportions retain their full precision.

## Expected monthly activity

`#/expected` provides recurring monthly income, expenses and same-currency transfers. Feature hooks own requests/state; controlled form/table organisms use the existing atoms and layouts. Use `npm run test:related -- src/pages/expected/ExpectedPage.tsx src/pages/application/App.tsx` during edits. API-client changes warrant broader related tests. The Expected browser journey runs in the existing desktop/mobile and dev/prod CI matrix.
