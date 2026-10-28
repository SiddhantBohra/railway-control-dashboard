# Failures and recovery

## Failure matrix

| Interruption                                               | Durable evidence                      | Behavior                                                        |
| ---------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------- |
| Database failure during acceptance                         | Transaction rolls back                | No provider request; intended state is unchanged                |
| HTTP response lost after commit                            | Queued operation + key                | Browser retains retry metadata; Recover request replays the key |
| Process exits before dispatch marker                       | Queued operation                      | New worker may safely perform initial dispatch                  |
| Process exits after marker, before/during call             | Dispatch marker                       | Read-only reconciliation; no blind resend                       |
| Start response lost                                        | No exact returned deployment ID       | Review required even if a new deployment looks plausible        |
| Stop response lost                                         | Exact target ID persisted before call | Reconcile exact target and full workload snapshot               |
| Explicit HTTP 429/local provider budget rejection          | Known non-dispatch                    | Back off; requeue only within deadline                          |
| Timeout, 5xx, malformed response or partial GraphQL errors | Possibly executed                     | Reconcile, then review if not provable                          |
| Provider rejects permissions/schema before dispatch        | Definitive failure                    | Safe failure; correct configuration before a new command        |
| New external deployment, drift or incomplete pagination    | Ambiguous observation                 | Block mutations, preserve evidence and request review           |
| Provider outage                                            | Last good observation + error         | Mark stale; do not call it stopped                              |
| Database connection holding leader lock is lost            | Persisted operation survives          | Worker stops, readiness fails; restart API                      |
| Ten-minute confirmation deadline expires                   | Potentially active workload           | Review required; deadline does not mean the container stopped   |

Stop success requires the exact deployment to report `REMOVED` and no other live deployment in a complete snapshot. If Railway stops returning removed deployment records, the command remains reviewable instead of inferring removal from a 404. Live verification must establish this behavior.

## Read-only recheck

Use **Recheck provider state**, or `POST /api/v1/operations/<id>/reconcile` with `{}` and normal session/origin/CSRF protection. It gives a review-required operation a new observation deadline. It never puts an uncertain operation back into the initial dispatch queue. Missing exact start IDs cannot be inferred by this path.

## Operator closure

An unresolved operation blocks future commands intentionally. If read-only evidence cannot settle it:

1. Inspect the exact configured project, environment and service in Railway. Review deployment IDs, timestamps, logs and external actions. Confirm the single-replica/image/sleep assumptions.
2. Resolve any unwanted workload externally with separate explicit authorization. The closure command itself performs **no provider action**.
3. Read the operation's current revision from its authenticated API response. Record the evidence, decision and operator identity in a reason of 20–1000 characters, without credentials.
4. Run from the repository with the matching API environment:

   ```sh
   corepack pnpm --filter @control/api review:close <operation-uuid> <revision> "Reviewed by operator-name: deployment evidence, external action and decision."
   ```

   In the built API container, the equivalent is:

   ```sh
   node dist/apps/api/src/operator/close-review.js <operation-uuid> <revision> "Reviewed by operator-name: evidence and decision."
   ```

5. Refresh the dashboard. Closure records `failed / OPERATOR_CLOSED` with a null outcome: **provider success was not confirmed**. It releases the conflict gate. Subsequent commands use a new idempotency key and fresh provider checks.

Closure is available only through operator process/database access, not an HTTP endpoint. It checks ownership, scope, `review_required` state and revision. The audit record and state transition share a transaction; an audit write failure rolls back closure. Existing target IDs and dispatch metadata are retained. Prior failure, reviewer subject, reason and timestamp remain in `operation_reviews`.

The application has one configured principal, so a named human in the reason supplements the process subject; this is not enterprise identity or tamper-proof auditing. Direct database administration remains privileged. Never unlock an uncertain operation by deleting its idempotency/history row or setting it back to `queued`.

## Operational checks

- Correlate `X-Request-Id` with API logs, then the operation UUID with worker dispatch/settlement logs.
- Check `/health/ready`, database connectivity and pending migration names first.
- `WORKER_LOCK_CONNECTION_LOST`: restart the single API instance. Do not launch extra replicas as a recovery technique.
- `PROVIDER_FORBIDDEN`: verify an environment-scoped project token and target IDs; never paste the token into UI or issue logs.
- `CONFIGURATION_DRIFT`: inspect image digest, source type, replica count and sleeping. Re-registration does not silently change mappings.
- `PROVIDER_RATE_LIMITED`: wait for cooldown. UI reads come from PostgreSQL; repeated Refresh will not force provider reads.
- `RESOURCE_NOT_FOUND` after environment edits: the persisted mapping and startup configuration must agree. Use a new `RESOURCE_ID` for a new mapping; keep old history for audit.

Back up PostgreSQL before a schema change. Rolling back application images does not roll back migrations. The migrations shipped here are additive; automated destructive down-migration or retention jobs are intentionally absent.
