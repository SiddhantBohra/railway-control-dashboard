import 'reflect-metadata';
import { Config } from '../config/config';
import { database } from './migrations';

export async function seedResource(config: Config): Promise<void> {
  const db = database(config.values.DATABASE_URL);
  try {
    await db.query(
      `INSERT INTO managed_resources
      (id, owner_subject, name, mode, project_id, environment_id, service_id, image)
      VALUES ($id, $owner, $name, $mode, $project, $environment, $service, $image)
      ON CONFLICT (id) DO NOTHING`,
      {
        bind: {
          id: config.values.RESOURCE_ID,
          owner: config.values.DEMO_USERNAME,
          name: config.values.RESOURCE_NAME,
          mode: config.values.PROVIDER_MODE,
          project: config.scope.projectId,
          environment: config.scope.environmentId,
          service: config.scope.serviceId,
          image: config.scope.image,
        },
      },
    );
  } finally {
    await db.close();
  }
}
if (require.main === module) {
  seedResource(new Config())
    .then(() => console.info('Managed resource registered. Existing mappings were preserved.'))
    .catch(() => {
      console.error('Resource registration failed. Check configuration and migrations.');
      process.exitCode = 1;
    });
}
