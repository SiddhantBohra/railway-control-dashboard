import type { Resource } from '@control/contracts';
import { OBSERVATION_FRESHNESS_MS } from '@control/contracts';
import type { ResourceRecord } from '../models/resource.model';

export function toResource(record: ResourceRecord, now = Date.now()): Resource {
  return {
    id: record.id,
    name: record.name,
    mode: record.mode,
    intendedState: record.intendedState,
    observedState: record.observedState,
    providerStatus: record.providerStatus,
    deploymentId: record.deploymentId,
    latestDeployment: record.latestDeployment,
    observedAt: record.observedAt?.toISOString() ?? null,
    stale:
      record.observationError !== null ||
      record.observedAt === null ||
      now - record.observedAt.getTime() >= OBSERVATION_FRESHNESS_MS,
    observationError: record.observationError,
    generation: record.generation,
    revision: record.revision,
    stopBehavior: 'remove_deployment',
  };
}
