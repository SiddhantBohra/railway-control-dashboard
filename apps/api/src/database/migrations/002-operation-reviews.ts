import type { QueryInterface } from 'sequelize';

export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query(`CREATE TABLE operation_reviews (
    operation_id uuid PRIMARY KEY REFERENCES operations(id) ON DELETE RESTRICT,
    actor_subject varchar(100) NOT NULL,
    reason text NOT NULL CHECK (length(reason) BETWEEN 20 AND 1000),
    reviewed_at timestamptz NOT NULL,
    prior_revision integer NOT NULL,
    prior_failure jsonb
  )`);
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query('DROP TABLE operation_reviews');
}
