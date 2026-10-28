# API contract

Browser base path: `/api/v1`. Use the same public origin as the UI. Swagger at `/api/docs` and its OpenAPI 3.1 document at `/api/docs/openapi.json` are protected by the same session.

## Authentication

1. `GET /auth/session` establishes a CSRF-bearing session and returns `{ authenticated, username, csrfToken }`.
2. `POST /auth/login` with `{ "username": "demo", "password": "..." }`, `Origin`, `Content-Type: application/json` and `X-CSRF-Token`.
3. Keep the rotated HttpOnly session cookie and use the new CSRF token from the response.
4. `POST /auth/logout` with `{}` and the same origin/CSRF requirements destroys the login session and returns anonymous session information.

Passwords and provider tokens are never exposed by resource responses. The browser uses credentials-enabled fetch; there is no bearer token for dashboard users. Unknown routes/fields, malformed UUIDs and unsupported query parameters are rejected rather than silently ignored.

## Routes

| Method/path (relative to `/api/v1`)       | Request                                                   | Result                                             |
| ----------------------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| `GET /auth/session`                       | No query                                                  | Session and CSRF token                             |
| `POST /auth/login`                        | Username/password                                         | Rotated authenticated session                      |
| `POST /auth/logout`                       | `{}`                                                      | Anonymous session                                  |
| `GET /resources`                          | No query                                                  | `{ resources: Resource[] }`                        |
| `GET /resources/:resourceId`              | UUID                                                      | Resource observation and intent                    |
| `POST /resources/:resourceId/operations`  | `{ "action": "start" }` or `stop`; UUID `Idempotency-Key` | `202` durable operation, or `200` completed replay |
| `GET /resources/:resourceId/operations`   | `limit=1..50`, optional cursor                            | Newest-first operations and `nextCursor`           |
| `GET /operations/:operationId`            | UUID                                                      | Current operation                                  |
| `POST /operations/:operationId/reconcile` | `{}`                                                      | `202`; schedules reads, never a mutation retry     |

`GET /health/live` and `/health/ready` are public, minimal health endpoints outside `/api/v1`. Readiness checks PostgreSQL and the worker lock connection, not Railway availability.

### Accept an operation

```http
POST /api/v1/resources/3b705c6a-d850-4e52-bdc3-1cbb10954f62/operations
Content-Type: application/json
Origin: http://localhost:3000
X-CSRF-Token: <current-session-token>
Idempotency-Key: <new-uuid-for-this-intent>
Cookie: <session-cookie>

{"action":"start"}
```

The response has `{ "operation": { ... }, "replayed": false }` and a `Location: /api/v1/operations/<id>` header. Persist/reuse the original key after losing an HTTP response. Same key/same content returns the same operation. Same key/different content returns `409 IDEMPOTENCY_KEY_REUSED`. A new key while an unresolved operation exists returns `409 RESOURCE_BUSY` with its operation ID. Idempotency records are retained with history; there is no automatic expiration.

Commands contain no provider target or credential fields. The client supplies only a local managed-resource UUID. Stop confirmation in the UI explicitly describes removal and ephemeral-data loss; the selected behavior is also returned as `stopBehavior: "remove_deployment"`.

## Transport types

The complete executable schemas are in `packages/contracts/src/index.ts` and are used by both Nest serialization and browser response validation.

**Resource:** `id`, `name`, `mode`, `intendedState`, `observedState`, `providerStatus`, `deploymentId`, `observedAt`, `stale`, `observationError`, `generation`, `revision`, `stopBehavior`.

**Operation:** `id`, `resourceId`, `action`, `state`, `acceptedAt`, `updatedAt`, `completedAt`, `deploymentId`, `failure`, `outcome`, `revision`. Operation state is independent of resource state. `review_required` has no completion timestamp. `already_satisfied` means no mutation was necessary.

## Errors

```json
{
  "error": {
    "code": "RESOURCE_BUSY",
    "message": "Resolve the current operation before requesting another action.",
    "requestId": "server-generated-request-id",
    "operationId": "existing-operation-uuid"
  }
}
```

| Status    | Typical meaning                                                    |
| --------- | ------------------------------------------------------------------ |
| 400       | Invalid body, route/query/header or cursor                         |
| 401       | Missing/expired session or incorrect credentials                   |
| 403       | Invalid origin or CSRF token                                       |
| 404       | Resource/operation absent or outside the principal's allowed scope |
| 409       | Busy resource, changed/terminal operation or idempotency conflict  |
| 413 / 415 | Oversized body / unsupported content type                          |
| 429       | Local request limit; honor `Retry-After`                           |
| 500 / 503 | Sanitized internal failure / unavailable infrastructure            |

Provider failure is normally recorded on an already accepted operation rather than returned as a failed acceptance HTTP request. Provider error messages are sanitized; a `200` GraphQL envelope with `errors` is not success.

## Polling

The UI polls operations every two seconds while active, history every fifteen seconds and resource observations every thirty seconds. Terminal and review-required operation polling stops; history and explicit Refresh can still discover changes. A stale API/failed request does not erase cached evidence. Mutations have no automatic transport retry; the recovery button repeats the same local key.
