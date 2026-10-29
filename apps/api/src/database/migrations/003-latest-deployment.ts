import type { QueryInterface } from 'sequelize';

export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query('ALTER TABLE managed_resources ADD COLUMN latest_deployment jsonb');
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query('ALTER TABLE managed_resources DROP COLUMN latest_deployment');
}
