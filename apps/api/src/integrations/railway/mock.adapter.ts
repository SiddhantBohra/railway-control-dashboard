import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RailwayLifecycle, ProviderError } from './railway.boundary';
import type { Deployment, RailwayTarget } from './railway.boundary';

// An explicitly ephemeral simulator. PostgreSQL durability is real; this provider is not.
@Injectable()
export class MockRailwayAdapter extends RailwayLifecycle {
  private readonly deployments = new Map<string, Deployment>();

  override async snapshot(_target: RailwayTarget) {
    return {
      deployments: [...this.deployments.values()].filter(
        (deployment) => deployment.status !== 'REMOVED',
      ),
      complete: true,
      observedAt: new Date(),
    };
  }
  override async deployment(_target: RailwayTarget, id: string) {
    const deployment = this.deployments.get(id);
    if (!deployment)
      throw new ProviderError(
        'MOCK_STATE_RESET',
        'The in-memory mock provider reset. Its previous deployment cannot be verified.',
      );
    return { ...deployment };
  }
  override async start(target: RailwayTarget) {
    const id = randomUUID();
    this.deployments.set(id, {
      id,
      status: 'SUCCESS',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      projectId: target.projectId,
      environmentId: target.environmentId,
      serviceId: target.serviceId,
      instances: [{ id: `${id}-instance`, status: 'RUNNING' }],
    });
    return id;
  }
  override async remove(target: RailwayTarget, id: string) {
    const deployment = await this.deployment(target, id);
    this.deployments.set(id, {
      ...deployment,
      status: 'REMOVED',
      updatedAt: new Date().toISOString(),
      instances: [],
    });
  }
}
