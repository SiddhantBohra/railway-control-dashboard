# Signal · Railway control

A deliberately small control room for one Railway workload. Next.js presents intent, provider observations and durable operation progress separately; NestJS owns authentication, orchestration and the Railway GraphQL boundary.

**Start creates a deployment. Stop removes that deployment, discarding ephemeral container data and preserving the service.** It is not a pause/resume API. A `202` response means the request is saved, not that Railway completed it.

The default demo uses a clearly labelled **local simulator**. PostgreSQL, HTTP, sessions, validation, the worker and browser flows are real. No Railway token is needed. Live Railway lifecycle verification and remote deployment have not been performed.

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

### Verify

Create the isolated integration-test database once:

```sh
docker compose exec postgres createdb -U control control_test
corepack pnpm exec playwright install chromium
corepack pnpm check
corepack pnpm test:integration
corepack pnpm test:e2e
```

If `control_test` already exists, skip `createdb`. Integration tests recreate its public schema and reject remote hosts or names without the `_test` suffix. They never reset the application database. E2E uses the local application database and leaves the simulator stopped, with visible history. Use a fresh mock-mode API process when repeating E2E rapidly: deliberate write/login limits can otherwise reject repeated runs.

`check` runs lint, formatting, strict typechecking, unit/component tests and production builds. Integration and browser checks are separate because they need PostgreSQL and Chromium. See [verification](docs/verification.md) for results and boundaries.

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
- One principal, one mapped image-pinned service, one replica, sleeping disabled. The dashboard and its database are independent of the managed workload.

This is a bounded interview/demo system, **not an exactly-once or highly available control plane**. An uncertain start response may require human review. The in-memory simulator loses deployment state when the API restarts; durable operations and history remain in PostgreSQL.

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
- [Failure recovery and operator review](docs/recovery.md)
- [Deployment, environment variables and live verification](docs/deployment.md)
- [Five-minute demo and reviewer questions](docs/interview.md)
- [Verification report and limitations](docs/verification.md)
