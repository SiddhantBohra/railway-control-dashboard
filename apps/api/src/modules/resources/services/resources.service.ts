import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from 'sequelize';
import { Config } from '../../../config/config';
import { ApiException } from '../../../common/api-error';
import { ResourcesRepository } from '../repositories/resources.repository';

@Injectable()
export class ResourcesService {
  constructor(
    @Inject(ResourcesRepository) private readonly resources: ResourcesRepository,
    @Inject(Config) private readonly config: Config,
  ) {}

  async requireOwned(id: string, owner: string, transaction?: Transaction) {
    if (id !== this.config.values.RESOURCE_ID || owner !== this.config.values.DEMO_USERNAME) {
      throw new ApiException(404, 'RESOURCE_NOT_FOUND', 'Managed resource not found.');
    }
    const resource = await this.resources.find(id, owner, transaction);
    const scope = this.config.scope;
    if (
      !resource ||
      resource.mode !== this.config.values.PROVIDER_MODE ||
      resource.projectId !== scope.projectId ||
      resource.environmentId !== scope.environmentId ||
      resource.serviceId !== scope.serviceId ||
      resource.image !== scope.image
    ) {
      throw new ApiException(
        404,
        'RESOURCE_NOT_FOUND',
        'Managed resource not found in the configured scope.',
      );
    }
    return resource;
  }

  async list(owner: string) {
    try {
      return [await this.requireOwned(this.config.values.RESOURCE_ID, owner)];
    } catch (error) {
      if (error instanceof ApiException && error.getStatus() === 404) return [];
      throw error;
    }
  }
}
