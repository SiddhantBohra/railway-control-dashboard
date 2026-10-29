# Signal · Railway control

A deliberately small control room for one Railway workload. Next.js presents intent, provider observations and durable operation progress separately; NestJS owns authentication, orchestration and the Railway GraphQL boundary.

**Start creates a deployment. Stop removes that deployment, discarding ephemeral container data and preserving the service.** It is not a pause/resume API. A `202` response means the request is saved, not that Railway completed it.

The default demo uses a clearly labelled **local simulator**. PostgreSQL, HTTP, sessions, validation, the worker and browser flows are real. No Railway token is needed. Separately authorized live Stop and Start operations succeeded on 2026-10-29; the dashboard itself is still local.

## Run locally

Prerequisites: Node **24.18.0** (`.nvmrc`), Corepack and Docker Compose. All direct dependencies and pnpm **10.34.9** are pinned; use `corepack pnpm` so a system pnpm installation cannot override the selected version.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm setup:local
corepack pnpm db:up
corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm dev
```

- Open **http://localhost:3000**, using `localhost` rather than `127.0.0.1` to match the configured origin.
- Sign in: **`demo` / `local-demo-only`**. These are intentionally public local-demo credentials.
- API readiness: http://localhost:3001/health/ready.
- After sign-in: http://localhost:3000/api/docs and `/api/docs/openapi.json`.
- `setup:local` writes an ignored `apps/api/.env` with a random session secret and Argon2id password hash. Existing configuration is preserved.

The database listens only on `127.0.0.1:55432`. Migrations are explicit and repeatable; Sequelize schema synchronization is disabled. The seed command registers the server-selected mapping without overwriting existing mappings.

Live mode uses `RAILWAY_TARGET_PROJECT_ID`, `RAILWAY_TARGET_ENVIRONMENT_ID` and `RAILWAY_TARGET_SERVICE_ID` for the managed workload, alongside `RAILWAY_TOKEN` and `RAILWAY_IMAGE`. Railway's injected `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID` and `RAILWAY_SERVICE_ID` describe the API's hosting environment and are not used as target configuration. See `apps/api/.env.example` for the supported settings.

### Verify

Create the isolated integration-test database once:

```sh
docker compose exec postgres createdb -U control control_test
corepack pnpm exec playwright install chromium
corepack pnpm check
corepack pnpm test:integration
corepack pnpm test:e2e
```

If `control_test` already exists, skip `createdb`. Integration tests recreate its public schema and reject remote hosts or names without the `_test` suffix. They never reset the application database. E2E requires a mock-mode API, uses the local application database and leaves the simulator stopped, with visible history. Check the **LOCAL SIMULATOR** banner before running it; the Playwright configuration can reuse an existing development server. Use a fresh mock-mode API process when repeating E2E rapidly: deliberate write/login limits can otherwise reject repeated runs.

`check` runs lint, formatting, strict typechecking, unit/component tests and production builds. Integration and browser checks are separate because they need PostgreSQL and Chromium.

### Stop local services

Use Ctrl-C for the development processes, then `docker compose down`. The named PostgreSQL volume is retained. To intentionally erase **this project's local demo and test data**, use `docker compose down --volumes`. No remote cleanup is automated.

## Design at a glance

```text
Browser (TanStack Query + shared Zod contracts)
    │ same-origin /api proxy, HttpOnly session + CSRF
Next.js App Router
    │
Nest controllers → application services → Sequelize repositories → PostgreSQL
                             │
                 single-concurrency durable processor
                             │
                 injectable RailwayLifecycle boundary
                       ┌─────┴─────┐
                    simulator    Railway GraphQL
```

- PostgreSQL transactions persist intent and an operation before external side effects.
- Unique actor/key fingerprints replay duplicate requests; a partial unique index excludes conflicting unresolved operations.
- A dispatch marker is saved before a provider mutation. Recovery reconciles by exact deployment ID and never blindly resends an uncertain mutation.
- Generation, revision and observation sequence checks protect persisted state from stale work.
- Unknown and stale observations remain visible; provider errors never become a fabricated “Stopped.”
- One principal, one mapped service with an exact image-reference allowlist, one replica, sleeping disabled. Digest pinning is supported; default/tagged images can resolve to different contents on later starts. The dashboard and its database are independent of the managed workload.

The system supports one API replica and does not guarantee exactly-once execution or high availability. An uncertain start response may require human review. The in-memory simulator loses deployment state when the API restarts; durable operations and history remain in PostgreSQL.

### Interface

The frontend uses locally owned shadcn/ui-based Radix components, Tailwind theme tokens and Lucide icons. `apps/web/components.json` configures the New York style; component source and MIT attribution live in `apps/web/src/components/ui`.

The timeline shows backend workflow stages, not an estimated Railway deployment percentage. Failed and uncertain requests remain visibly unconfirmed. Skeleton screens and inline loaders cover session, resources, history and request states; animations respect reduced-motion preferences.

## Repository map

| Path                                | Responsibility                                                            |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `apps/web/src/features`             | Session gate, controls, accessible removal dialog, progress and history   |
| `apps/api/src/modules`              | Auth, resources, operation services/repositories and health               |
| `apps/api/src/integrations/railway` | Fixed GraphQL documents, validation, scope checks and sanitized errors    |
| `apps/api/src/database`             | Explicit migrations and resource registration                             |
| `packages/contracts`                | Browser-safe Zod transport contracts, no server credentials or ORM models |
| `apps/api/test`, `e2e`              | Database/API recovery tests and real local browser flows                  |
| `deploy`                            | Non-root, multi-stage API and standalone Next.js Dockerfiles              |

## Read next

- [Architecture, invariants and rejected alternatives](docs/architecture.md)
- [API and authentication contract](docs/api.md)
