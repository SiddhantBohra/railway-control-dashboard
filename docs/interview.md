# Interview walkthrough

## Five-minute demo

1. **0:00 — Scope.** Open http://localhost:3000 and sign in with `demo / local-demo-only`. Point out the simulator banner. Explain that browser/API/PostgreSQL are real, while Railway side effects are mocked for local review.
2. **0:30 — Three dimensions.** Identify intended state, observed status/timestamp and operation state. “Accepted does not mean running; stale does not mean stopped.”
3. **1:00 — Start and refresh.** Start the workload. Show the persisted operation reference, refresh the page and observe completion. Explain why the browser is not responsible for finishing work.
4. **1:45 — Stop deliberately.** Open the confirmation dialog, cancel and show restored keyboard focus. Confirm removal, explicitly naming ephemeral-data loss and service preservation. Start again, showing a new operation and deployment.
5. **2:30 — Durable behavior.** Open protected Swagger. Show `Idempotency-Key`, `202`, `Location` and the conflict response. Walk through `OperationsService.accept` and the two uniqueness constraints in migration 001.
6. **3:15 — The hard failure.** Show the PostgreSQL test for a lost start response: exactly one fake-provider call, then `review_required`. Read-only recheck cannot invent an exact ID. Show the audited operator closure runbook.
7. **4:15 — Boundaries and tradeoffs.** Follow controller → service → repository and `RailwayLifecycle`. Describe one-replica limitations, lack of exactly-once and the live validation still required.
8. **4:45 — Evidence.** Open `docs/verification.md`. Stop the local simulator after the demonstration.

## Questions to be ready for

**Why not return success immediately after the mutation?** A successful request is not a successful deployment. The API persists intent, returns an operation and separately verifies provider evidence.

**What if the database fails after Railway accepted Start?** The dispatch marker already exists. A restart does not resend. If the result ID was not persisted, the operation requires review; safety is favored over automatic liveness.

**Does idempotency mean exactly once?** It means duplicate local intents share one record. Railway and PostgreSQL have no shared atomic transaction or end-to-end idempotency guarantee. Network ambiguity remains.

**What happens if two clients click opposite actions?** A resource-row lock serializes acceptance and the partial unique index permits one unresolved operation. The losing request gets a useful conflict with the existing ID.

**Why can’t the newest deployment resolve an uncertain Start?** Another actor could have deployed in the same interval. Baseline IDs/timestamps are evidence, not reliable correlation.

**Why PostgreSQL instead of Redis/queues?** The workload is tiny and already needs durable state. A PostgreSQL operation table avoids a second infrastructure dependency and transactional dual-write. At scale, partitioned queues and provider fencing would need a new design.

**Can it run several API replicas?** Acceptance is database-protected and leadership is guarded, but the system is explicitly single-replica: process-local rate limits/budgets and advisory-lock partition semantics are not a complete HA design.

**Why shared Zod types instead of sharing models?** Browser-safe runtime contracts prevent drift without leaking ORM/provider concerns. OpenAPI and response serialization use the same schemas.

**Why explicit removal for Stop?** It gives a clearly disclosed service-preserving lifecycle with exact deployment targeting. It discards ephemeral data and creates a new deployment on Start. Native stop/restart has different semantics and must not be substituted silently.

**How do you prevent a user controlling arbitrary services?** The client can only select a local resource UUID. Ownership and config-mapping checks precede reads/acceptance; the adapter checks allowlisted target values and returned deployment ownership.

**What does a green Running badge prove?** A provider deployment reports SUCCESS with a running instance in a complete snapshot. It does not prove the application's endpoint is healthy.

**What would you do next?** Perform approved live lifecycle and HTTPS/proxy verification first. Then add per-user ownership/identity, stronger audit retention, distributed limiting, production monitoring and a proper worker/fencing strategy if scale requires it.
