# Frontend development

The frontend uses React, TypeScript and Vite. ESLint checks correctness and accessibility; Prettier owns formatting. Install with `npm ci`.

| Command                | Purpose                                                                |
| ---------------------- | ---------------------------------------------------------------------- |
| `npm run dev`          | Start the development server                                           |
| `npm run lint`         | Check source, tests, browser journeys and configuration; warnings fail |
| `npm run lint:fix`     | Apply safe lint fixes                                                  |
| `npm run format`       | Format frontend files                                                  |
| `npm run format:check` | Check formatting without rewriting files                               |
| `npm run typecheck`    | Check application and tooling/browser-test TypeScript                  |
| `npm test`             | Run component and API tests                                            |
| `npm run test:tooling` | Verify hook, promise, accessibility and architecture rules             |
| `npm run build`        | Typecheck and build production assets                                  |
| `npm run test:e2e`     | Run desktop and mobile browser journeys                                |

The repository recommends the VS Code ESLint and Prettier extensions and enables format-on-save. Prettier requires a configuration, so its frontend configuration does not format backend files. Other editors can use the same configuration and npm commands. There are no commit hooks. CI checks lint, formatting and tooling rules before building and testing.

TypeScript 6.0.3 is pinned to stay within typescript-eslint's supported compiler range. ESLint and its plugins are pinned as a compatible set; update their peer dependencies together. Do not bypass compatibility with forced installs. Formatting excludes generated lockfiles, build output, dependencies and test artifacts.

## Atomic design

| Layer                          | Responsibility                                                           | Examples                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `components/atoms`             | Native accessible controls and small presentation primitives             | Button, Input, Select, Checkbox, Radio, Link, Badge                                      |
| `components/molecules`         | Small reusable compositions                                              | Field, ActionGroup, SegmentedControl, Confirmation, feedback                             |
| `components/organisms`         | Controlled feature sections composed from lower layers                   | Navigation, workspace heading, account/category forms, expense chart, spending hierarchy |
| `components/templates`         | Layout and composition slots without data fetching                       | ApplicationLayout, WorkspaceLayout, AuthenticationLayout                                 |
| `pages`                        | Route and feature controllers that compose templates and organisms       | Accounts, Categories, Spending, sign-in and MFA controllers                              |
| `hooks`                        | Page state, API requests, mutations and lifecycle handling               | Session restoration, stale-form recovery, report loading                                 |
| `services` / `types` / `utils` | Request implementation, DTO/prop contracts and pure presentation helpers | API client, exact decimal formatting, bounded SVG geometry                               |

Organisms are grouped by feature. Place tests alongside the component or controller they exercise. A component does not need a new wrapper at every layer: extract a composition when it has a clear UI responsibility or reuse.

Atoms cannot import higher layers. Molecules may compose atoms; organisms may compose atoms/molecules; templates may compose these layers. Same-layer composition is allowed. Pages orchestrate the hierarchy. ESLint rejects UI-layer imports of services, hooks and page controllers, including re-exports and dynamic imports. Inject typed data, callbacks and child slots instead. UI view-model contracts are type-only; they do not import hooks at runtime.

Financial rules remain on the backend. Display exact monetary strings through presentation helpers; only chart geometry uses approximations. Keep session expiry, pending/error states, retained failed input and optimistic versions in feature hooks. Shared controls preserve native semantics, refs and keyboard access. Use Button variants instead of duplicating control styles. Focus newly opened forms explicitly through Input's `focusOnMount` prop.

Styles are split into existing-value tokens, base rules and component rules. This change establishes composition and tooling; the Categories/Spending visual redesign remains a separate task. Preserve accessible names and selectors when extracting components, and verify affected journeys on desktop and mobile.

Browser tests require the dedicated synthetic database described in the root README; never run fixtures against production data. The CI matrix runs development and production backend profiles.
