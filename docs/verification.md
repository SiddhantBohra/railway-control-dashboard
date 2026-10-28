# Verification report

Date: 2026-10-28. Environment: macOS ARM64, Node 24.18.0, pnpm 10.34.9, PostgreSQL 17.11 in local Docker. API and browser tests use the mock Railway boundary. Docker images target the local Linux ARM64 engine.

## Current evidence

The repository's commands reproduce these local results; no remote credential is required.

| Check                               | Result                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| Strict workspace TypeScript         | Passed                                                                         |
| API/domain/provider unit tests      | 15 passed across 4 suites                                                      |
| React component tests               | 4 passed across 2 suites                                                       |
| PostgreSQL/API integration          | 22 passed across 2 suites                                                      |
| Playwright Chromium                 | 2 passed, including lost-response recovery and logout                          |
| ESLint / Prettier                   | Passed                                                                         |
| Production Next/API/contracts build | Passed                                                                         |
| API and web Docker builds           | Passed with locked, offline production dependency packaging                    |
| Container smoke                     | Passed: standalone HTML, API readiness, proxied session and protected reads    |
| Mobile visual inspection            | 390px viewport, no document overflow; controls/history/stale evidence readable |
| Real Railway read/mutation          | Not run                                                                        |
| Remote deployment/public HTTPS      | Not run                                                                        |

## What the tests establish

- **Domain/provider:** incomplete or unfamiliar evidence stays unknown, running-instance requirement, failed deployments, HTTP-200 GraphQL errors, sanitized errors, network uncertainty without automatic mutation retry, 429/backoff and provider remaining/reset headers, scope and configuration drift.
- **Database/recovery:** repeatable migrations, foreign keys, partial unique unresolved-operation constraint, six concurrent duplicate requests, concurrent opposite commands, fingerprint conflicts, transaction rollback, full fake-provider start/stop/start cycle, lost start/stop responses, reconstructed Nest application recovery, persisted dispatch-marker behavior, stale evidence ordering, empty-snapshot recovery, pagination and atomic audited operator closure.
- **API:** protected reads/docs, ownership masking, Passport/session flow, credential validation before Passport, origin/CSRF checks, logout, strict body/query/header/route validation, body-size/content-type limits, bounded login attempts, durable `202`/Location/replay/conflict responses and generated OpenAPI.
- **Components:** explicit removal confirmation/cancel focus, disabled conflicting controls and honest pending/review-required presentation.
- **Browser:** real local UI/API/database with mocked provider; sign-in, lifecycle, interrupted-response recovery, refresh, cancellation/confirmation, history, logout, keyboard login and unavailable-API messaging.

## Bugs found during verification

- Swagger generation initially collided on reused explicit Zod schema IDs; removed those IDs and verified the generated OpenAPI endpoint.
- Empty query validation needed a custom decorator rather than an invalid root query parameter in Swagger.
- Nested commands used the machine's global pnpm version; root scripts now explicitly use Corepack.
- A rate-limit cooldown accidentally included an hour-long budget delay even when budget remained; separated those calculations.
- A complete empty provider snapshot could not clear a previously stored deployment because Sequelize ignored an empty object inside an OR predicate. Conditional timestamp filtering and a real PostgreSQL regression test cover the fix.
- Browser assertions initially confused intended and observed state, and Next's route announcer with the login alert; selectors now target the relevant UI region.
- Logout originally removed the active session query before publishing anonymous state. Preserving that query while clearing protected data fixes the transition; expired authenticated reads also invalidate the session query.
- Oversized parser errors needed an explicit safe 413 mapping. Integration tests cover size, malformed JSON, content type and login-attempt limits.
- Legacy pnpm deployment re-resolved workspace dependencies. Injected workspace support now allows production deployment to reuse the frozen dependency graph offline.

## Boundaries of confidence

Schema/docs were reviewed against the pinned Railway CLI schema source linked in the deployment guide. No live token permission, actual Start/Remove outcome, post-removal query behavior, external reachability, account rate tier or remote proxy-cookie behavior has been verified. The local restart test reconstructs the Nest app while retaining the fake provider; it is not a live provider fault-injection test. Mock deployment state itself is in-memory and resets on API restart.

The browser checks run Chromium, not a cross-browser matrix or a formal accessibility audit. Visual/keyboard checks do not establish WCAG conformance. Docker builds verify packaging; a remote release requires the operator acceptance protocol in `deployment.md`.
