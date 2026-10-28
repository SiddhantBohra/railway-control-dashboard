import 'reflect-metadata';
import { Config } from '../src/config/config';
import { RailwayGraphqlClient } from '../src/integrations/railway/graphql.client';
import { RailwayAdapter } from '../src/integrations/railway/railway.adapter';
import { ProviderError } from '../src/integrations/railway/railway.boundary';
import { observedState } from '../src/modules/operations/domain/lifecycle';

async function main() {
  if (process.env['ALLOW_RAILWAY_READ'] !== 'yes')
    throw new Error('Set ALLOW_RAILWAY_READ=yes to opt into a read-only Railway request.');
  const config = new Config();
  if (config.values.PROVIDER_MODE !== 'railway')
    throw new Error('Smoke verification requires PROVIDER_MODE=railway.');
  const adapter = new RailwayAdapter(new RailwayGraphqlClient(config), config);
  const snapshot = await adapter.snapshot(config.scope);
  console.info(
    JSON.stringify({
      mode: 'railway',
      readOnly: true,
      complete: snapshot.complete,
      observedState: observedState(snapshot),
      deployments: snapshot.deployments.map(({ id, status }) => ({ id, status })),
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof ProviderError
      ? `${error.code}: ${error.message}`
      : 'Read-only smoke check failed. Check opt-in, configuration and token scope.',
  );
  process.exitCode = 1;
});
