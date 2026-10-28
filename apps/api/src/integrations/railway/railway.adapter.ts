import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Config } from '../../config/config';
import { RailwayLifecycle, ProviderError } from './railway.boundary';
import type { Deployment, RailwayTarget } from './railway.boundary';
import { RailwayGraphqlClient } from './graphql.client';
import { DEPLOYMENT, REMOVE, SNAPSHOT, START } from './documents';

const deploymentSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  projectId: z.string(),
  environmentId: z.string(),
  serviceId: z.string().nullable(),
  instances: z.array(z.object({ id: z.string(), status: z.string() })).max(20),
});
const snapshotSchema = z.object({
  serviceInstance: z.object({
    serviceId: z.string(),
    environmentId: z.string(),
    numReplicas: z.number().nullable(),
    sleepApplication: z.boolean().nullable(),
    source: z.object({ image: z.string().nullable(), repo: z.string().nullable() }).nullable(),
    activeDeployments: z.array(deploymentSchema).max(20),
    latestDeployment: deploymentSchema.nullable(),
  }),
  deployments: z.object({
    edges: z.array(z.object({ node: deploymentSchema })).max(20),
    pageInfo: z.object({ hasNextPage: z.boolean() }),
  }),
});

@Injectable()
export class RailwayAdapter extends RailwayLifecycle {
  constructor(
    @Inject(RailwayGraphqlClient) private readonly client: RailwayGraphqlClient,
    @Inject(Config) private readonly config: Config,
  ) {
    super();
  }

  private assertTarget(target: RailwayTarget): void {
    const allowed = this.config.scope;
    if (
      target.projectId !== allowed.projectId ||
      target.environmentId !== allowed.environmentId ||
      target.serviceId !== allowed.serviceId ||
      target.image !== allowed.image
    ) {
      throw new ProviderError(
        'TARGET_OUT_OF_SCOPE',
        'The target does not match the configured workload.',
        'rejected',
      );
    }
  }

  private assertDeployment(target: RailwayTarget, deployment: Deployment): void {
    if (
      deployment.projectId !== target.projectId ||
      deployment.environmentId !== target.environmentId ||
      deployment.serviceId !== target.serviceId
    ) {
      throw new ProviderError(
        'TARGET_OUT_OF_SCOPE',
        'Railway returned a deployment outside the configured workload.',
        'rejected',
      );
    }
  }

  override async snapshot(target: RailwayTarget) {
    this.assertTarget(target);
    const data = await this.client.request(
      SNAPSHOT,
      {
        serviceId: target.serviceId,
        environmentId: target.environmentId,
        input: {
          projectId: target.projectId,
          serviceId: target.serviceId,
          environmentId: target.environmentId,
          status: { notIn: ['REMOVED', 'FAILED', 'CRASHED', 'SKIPPED'] },
        },
      },
      snapshotSchema,
    );
    const instance = data.serviceInstance;
    if (
      instance.serviceId !== target.serviceId ||
      instance.environmentId !== target.environmentId ||
      instance.source?.image !== target.image ||
      instance.source.repo !== null ||
      instance.numReplicas !== 1 ||
      instance.sleepApplication === true
    ) {
      throw new ProviderError(
        'CONFIGURATION_DRIFT',
        'Use one replica, the allowlisted image, and disabled sleeping. Check Railway service settings.',
        'rejected',
      );
    }
    const deployments = [
      ...new Map(
        [
          ...(instance.latestDeployment ? [instance.latestDeployment] : []),
          ...data.deployments.edges.map(({ node }) => node),
          ...instance.activeDeployments,
        ].map((deployment) => [deployment.id, deployment]),
      ).values(),
    ];
    deployments.forEach((deployment) => this.assertDeployment(target, deployment));
    return {
      deployments,
      complete: !data.deployments.pageInfo.hasNextPage,
      observedAt: new Date(),
    };
  }

  override async deployment(target: RailwayTarget, id: string) {
    this.assertTarget(target);
    const data = await this.client.request(
      DEPLOYMENT,
      { id },
      z.object({ deployment: deploymentSchema }),
    );
    this.assertDeployment(target, data.deployment);
    return data.deployment;
  }

  override async start(target: RailwayTarget): Promise<string> {
    this.assertTarget(target);
    const data = await this.client.request(
      START,
      { serviceId: target.serviceId, environmentId: target.environmentId },
      z.object({ serviceInstanceDeployV2: z.string().min(1) }),
    );
    return data.serviceInstanceDeployV2;
  }

  override async remove(target: RailwayTarget, deploymentId: string): Promise<void> {
    this.assertTarget(target);
    // The processor has already verified ownership through a fresh snapshot. Do not add
    // a second mutation or silently substitute serviceDelete when removal fails.
    const data = await this.client.request(
      REMOVE,
      { id: deploymentId },
      z.object({ deploymentRemove: z.boolean() }),
    );
    if (!data.deploymentRemove)
      throw new ProviderError(
        'PROVIDER_NOT_ACKNOWLEDGED',
        'Railway did not acknowledge deployment removal.',
      );
  }
}
