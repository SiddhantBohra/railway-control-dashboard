# Deployment and Railway verification

Deployment is an operator-run step. The delivered verification used local PostgreSQL and the simulator; no paid resource was created and no real Railway credential or lifecycle mutation was used.

## Topology

Use separate services for **web**, **API/worker**, **PostgreSQL** and the **managed demo workload**. The controlled workload must not host the dashboard or its database. Give web a public HTTPS origin. Keep API and PostgreSQL on the private network. Only the API receives the environment-scoped Railway project token.

Deploy one API replica and one managed-workload replica. Disable sleeping for both the API/worker and the controlled workload. Use a stateless, digest-pinned image as the workload source; disable Git auto-deploy and cron triggers for the demonstration. Stop discards ephemeral container data. Do not use this lifecycle for a database or persistent workload.

## Images

Build from the repository root:

```sh
docker build -f deploy/api.Dockerfile -t signal-api:local .
docker build -f deploy/web.Dockerfile \
  --build-arg API_INTERNAL_ORIGIN=http://api.railway.internal:3001 \
  -t signal-web:local .
```

Both images use pinned Node 24.18.0, a frozen pnpm lockfile, separate build/runtime stages and the non-root `node` user. The API deploy output contains production dependencies and compiled artifacts. Next.js uses standalone output with monorepo tracing and static assets copied into the runtime image. `.dockerignore` excludes environment files, credentials, local artifacts and installed dependencies.

`API_INTERNAL_ORIGIN` is a **build-time** value: Next rewrites are serialized into standalone output. It must be the API's actual private hostname and port. Rebuild web when it changes. It contains no credentials. The browser always calls the public same-origin `/api` route.

## Railway service settings

As of the documentation checked on 2026-10-28, new Railway services cannot opt into the deprecated `railway.json`/`railway.toml` Config as Code mechanism. Configure these service settings in the dashboard, or import the approved environment into Railway's current Infrastructure as Code tooling. See [Railway IaC](https://docs.railway.com/infrastructure-as-code). This repository does not apply project-wide provisioning or changes to unrelated services.

| Setting                   | API                                                                                     | Web                                   |
| ------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------- |
| Source root/build context | Repository root                                                                         | Repository root                       |
| Dockerfile path           | `deploy/api.Dockerfile`                                                                 | `deploy/web.Dockerfile`               |
| Start                     | Docker CMD                                                                              | Docker CMD                            |
| Port                      | Explicit `PORT=3001`                                                                    | `PORT=3000` or platform-injected port |
| Pre-deploy                | `node dist/apps/api/src/database/migrate.js && node dist/apps/api/src/database/seed.js` | None                                  |
| Healthcheck               | `/health/ready`                                                                         | `/`                                   |
| Health timeout            | 60 seconds                                                                              | 60 seconds                            |
| Replicas                  | 1                                                                                       | 1                                     |
| Restart                   | On failure, bounded retries                                                             | On failure, bounded retries           |
| Public access             | Private only                                                                            | Public HTTPS domain                   |

Serialize migration execution to one release process. The API listens on the IPv6 wildcard with IPv4 dual-stack support for private networking. Configure the web build argument using Railway build variables. Route health checks to the configured port. `/health/ready` checks the DB and lock connection; it does not guarantee provider availability or workload health.

### API variables

| Variable                 | Required/default         | Notes                                                                  |
| ------------------------ | ------------------------ | ---------------------------------------------------------------------- |
| `NODE_ENV`               | `production` remotely    | Requires HTTPS public origin; secure cookie                            |
| `PORT`                   | `3001`                   | Match web's internal target port                                       |
| `DATABASE_URL`           | Required                 | PostgreSQL connection URL; use provider TLS settings where applicable  |
| `PUBLIC_ORIGIN`          | Required                 | Exact web HTTPS origin, without trailing slash                         |
| `SESSION_SECRET`         | Required, ≥32 characters | Generate a fresh high-entropy secret; rotating it invalidates sessions |
| `DEMO_USERNAME`          | Required                 | Single configured principal and resource owner                         |
| `DEMO_PASSWORD_HASH`     | Required                 | Argon2id hash, not plaintext                                           |
| `PROVIDER_MODE`          | `mock` by default        | Set `railway` only when ready for real provider access                 |
| `WORKER_ENABLED`         | `true`                   | Set false temporarily for configuration/read-only setup                |
| `RESOURCE_ID`            | Required UUID            | New local ID for a new mapping; preserve old history                   |
| `RESOURCE_NAME`          | `Signal demo`            | Display name, ≤100 characters                                          |
| `RAILWAY_TOKEN`          | Railway mode             | Project token scoped to the selected environment                       |
| `RAILWAY_PROJECT_ID`     | Railway mode             | Allowlisted UUID                                                       |
| `RAILWAY_ENVIRONMENT_ID` | Railway mode             | Allowlisted UUID                                                       |
| `RAILWAY_SERVICE_ID`     | Railway mode             | Only the managed demo service UUID                                     |
| `RAILWAY_IMAGE`          | Railway mode             | Exact `registry/image@sha256:<64 lowercase hex>`                       |
| `PROXY_TRUST_HOPS`       | `0` locally              | 0–2; match actual trusted edge/Next/API hop count                      |
| `PROVIDER_IDLE_MS`       | `120000`                 | Idle read interval; evidence becomes stale after 180000 ms             |
| `OPERATION_DEADLINE_MS`  | `600000`                 | Confirmation deadline, maximum 1800000 ms                              |

For TLS terminated upstream, Nest must trust the correct proxy chain so Secure cookies work. In an edge → Next → API topology, validate forwarded headers and the chosen hop count (usually 2); restrict direct access to API so clients cannot bypass those hops. Never blindly trust arbitrary forwarded headers. Verify the production response sets `__Host-control.sid; Secure; HttpOnly; SameSite=Strict` through the actual public HTTPS domain.

Hash a production password with the stdin-based helper; enter it without putting it in shell history:

```sh
corepack pnpm --filter @control/api password:hash
```

Type the password and send EOF, or pipe from a password manager. Store the result as a secret API variable. The local helper credentials are unsuitable for an exposed deployment. Do not put API secrets in any `NEXT_PUBLIC_*` variable, Docker build argument or committed `.env`.

### Mapping registration

Run migrations, then seed with the final variables. Seed does `ON CONFLICT (id) DO NOTHING`; configuration edits do not overwrite the old mapping. For a new mode/service/image, use a new resource UUID and register it, retaining previous operations. Resolve old uncertain work against its original configuration before switching mappings.

## Provider contract and evidence

Checked against the official [API](https://docs.railway.com/integrations/api), [deployment](https://docs.railway.com/integrations/api/manage-deployments) and [service](https://docs.railway.com/integrations/api/manage-services) documentation and [Railway CLI schema](https://github.com/railwayapp/cli/blob/4a13c465c18097b362cbfbd632f016424d764de2/src/gql/schema.json), commit `4a13c465c18097b362cbfbd632f016424d764de2`.

- Endpoint: `https://backboard.railway.com/graphql/v2`.
- Header: `Project-Access-Token`, for an environment-scoped project token.
- Start: `serviceInstanceDeployV2(serviceId, environmentId)`, returns a deployment ID.
- Stop: `deploymentRemove(id)`, followed by exact-ID reconciliation; the service remains.
- Reads: `serviceInstance`, bounded filtered `deployments` and exact `deployment(id)`; include active instances and latest failed deployment evidence.
- `deploymentStop`/`deploymentRestart` have different native semantics. Reported native-stop observation issues were part of the decision to use explicit removal: [discussion](https://station.railway.com/questions/railway-platform-technical-failure-causi-6356c6f0). This report is not proof that all current native-stop calls fail.

Schema/document review proves available fields and types, not real permissions, runtime behavior, timing or reachability. Unknown statuses and incomplete responses fail closed. There is no fallback to `serviceDelete`.

## Opt-in live smoke check

After separate approval to use the configured credential, run one **read-only** snapshot with the worker disabled during setup:

```sh
ALLOW_RAILWAY_READ=yes corepack pnpm --filter @control/api test:railway
```

This requires `PROVIDER_MODE=railway` and all target variables. It verifies token scope, response shape, mapping/image/replica/sleep assumptions and prints deployment IDs/statuses. It never starts or removes a deployment. The normal unit/integration/E2E commands cannot invoke this smoke test implicitly.

### Live lifecycle acceptance protocol

After explicit authorization for the exact stateless target and potential cost:

1. Record target IDs, image digest, replica count and baseline deployments. Confirm controls and database are independent.
2. Enable the single worker. Sign in through public HTTPS; check cookie flags, protected reads and rejected cross-origin writes.
3. Request Start. Record the HTTP operation UUID and returned provider deployment ID. Require running-instance evidence; independently probe the workload if it exposes HTTP.
4. Retry the original key and verify the same operation/deployment; attempt an overlapping action and expect `409` while unresolved.
5. Confirm Stop's removal dialog. Verify the exact deployment becomes `REMOVED`, other live deployments are absent, the workload stops responding and the service/configuration still exists.
6. Start again and confirm a new deployment ID with the same image. Check provider logs and costs.
7. Exercise restart/timeout scenarios on the disposable target only with explicit approval. Never induce failures on an unrelated service.
8. Stop/remove the demo deployment only as authorized; separately review whether to remove dashboard services/database. This repository does not automatically delete remote resources.

Record actual timestamps, IDs and observations in the verification report. A simulator pass must never be presented as a completed live acceptance test.
