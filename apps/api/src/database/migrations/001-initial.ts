import type { QueryInterface } from 'sequelize';

// SQL is static; runtime values are always passed as binds in repositories.
export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.transaction(async (transaction) => {
    await context.sequelize.query(
      `
      CREATE TABLE managed_resources (
        id uuid PRIMARY KEY,
        owner_subject varchar(100) NOT NULL,
        name varchar(100) NOT NULL,
        mode text NOT NULL CHECK (mode IN ('mock','railway')),
        project_id text NOT NULL,
        environment_id text NOT NULL,
        service_id text NOT NULL,
        image text NOT NULL,
        intended_state text CHECK (intended_state IN ('running','stopped')),
        generation integer NOT NULL DEFAULT 0 CHECK (generation >= 0),
        revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
        observation_sequence integer NOT NULL DEFAULT 0,
        observed_state text NOT NULL DEFAULT 'unknown' CHECK (observed_state IN ('running','stopped','transitioning','sleeping','failed','unknown')),
        provider_status text,
        deployment_id text,
        observed_at timestamptz,
        provider_updated_at timestamptz,
        observation_error jsonb,
        UNIQUE (project_id, environment_id, service_id)
      );
      CREATE TABLE operations (
        id uuid PRIMARY KEY,
        resource_id uuid NOT NULL REFERENCES managed_resources(id) ON DELETE RESTRICT,
        actor_subject varchar(100) NOT NULL,
        action text NOT NULL CHECK (action IN ('start','stop')),
        generation integer NOT NULL CHECK (generation > 0),
        idempotency_key uuid NOT NULL,
        fingerprint char(64) NOT NULL,
        state text NOT NULL CHECK (state IN ('queued','dispatching','reconciling','succeeded','failed','review_required')),
        target_deployment_id text,
        result_deployment_id text,
        baseline_deployment_ids jsonb NOT NULL DEFAULT '[]',
        dispatch_at timestamptz,
        accepted_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        completed_at timestamptz,
        next_check_at timestamptz NOT NULL,
        deadline_at timestamptz NOT NULL,
        attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        revision integer NOT NULL DEFAULT 0,
        failure jsonb,
        outcome text CHECK (outcome IN ('applied','already_satisfied')),
        UNIQUE (actor_subject, idempotency_key),
        CHECK ((state IN ('succeeded','failed')) = (completed_at IS NOT NULL)),
        CHECK (state <> 'dispatching' OR dispatch_at IS NOT NULL)
      );
      CREATE UNIQUE INDEX operations_one_unresolved ON operations(resource_id)
        WHERE state IN ('queued','dispatching','reconciling','review_required');
      CREATE INDEX operations_history ON operations(resource_id, accepted_at DESC, id DESC);
      CREATE INDEX operations_due ON operations(next_check_at)
        WHERE state IN ('queued','dispatching','reconciling');
      CREATE TABLE sessions (
        sid varchar PRIMARY KEY,
        sess json NOT NULL,
        expire timestamp(6) NOT NULL
      );
      CREATE INDEX sessions_expire ON sessions(expire);
    `,
      { transaction },
    );
  });
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query(
    'DROP TABLE sessions; DROP TABLE operations; DROP TABLE managed_resources;',
  );
}
