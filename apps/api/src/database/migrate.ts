import 'reflect-metadata';
import { database, migrations } from './migrations';

async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');
  const sequelize = database(url);
  try {
    const applied = await migrations(sequelize).up();
    console.info(`Applied ${applied.length} migrations.`);
  } finally {
    await sequelize.close();
  }
}
main().catch(() => {
  console.error('Migration failed. Check database connectivity and migration state.');
  process.exitCode = 1;
});
