import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { literal, Op } from 'sequelize';
import type { Transaction } from 'sequelize';
import type { Failure, ObservedState } from '@control/contracts';
import { ResourceModel } from '../models/resource.model';
import type { ResourceRecord } from '../models/resource.model';

const attributes: (keyof ResourceRecord)[] = [
  'id',
  'ownerSubject',
  'name',
  'mode',
  'projectId',
  'environmentId',
  'serviceId',
  'image',
  'intendedState',
  'generation',
  'revision',
  'observationSequence',
  'observedState',
  'providerStatus',
  'deploymentId',
  'observedAt',
  'providerUpdatedAt',
  'observationError',
];
export interface ObservationTicket {
  resourceId: string;
  generation: number;
  sequence: number;
}
export interface ObservationUpdate {
  observedState: ObservedState;
  providerStatus: string | null;
  deploymentId: string | null;
  observedAt: Date;
  providerUpdatedAt: Date | null;
}

@Injectable()
export class ResourcesRepository {
  constructor(@InjectModel(ResourceModel) private readonly model: typeof ResourceModel) {}

  async find(id: string, owner: string, transaction?: Transaction): Promise<ResourceRecord | null> {
    const row = await this.model.findOne({
      where: { id, ownerSubject: owner },
      attributes,
      ...(transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {}),
    });
    return row?.get({ plain: true }) ?? null;
  }

  async setIntent(
    resource: ResourceRecord,
    intendedState: 'running' | 'stopped',
    transaction: Transaction,
  ): Promise<number> {
    const generation = resource.generation + 1;
    await this.model.update(
      { intendedState, generation, revision: resource.revision + 1 },
      { where: { id: resource.id }, transaction },
    );
    return generation;
  }

  async beginObservation(resource: ResourceRecord): Promise<ObservationTicket | null> {
    const [count, rows] = await this.model.update(
      { observationSequence: literal('observation_sequence + 1') },
      { where: { id: resource.id, generation: resource.generation }, returning: true },
    );
    const row = rows[0];
    return count && row
      ? { resourceId: row.id, generation: row.generation, sequence: row.observationSequence }
      : null;
  }

  async observe(ticket: ObservationTicket, observation: ObservationUpdate): Promise<boolean> {
    const [count] = await this.model.update(
      { ...observation, observationError: null, revision: literal('revision + 1') },
      {
        where: {
          id: ticket.resourceId,
          generation: ticket.generation,
          observationSequence: ticket.sequence,
          // Provider timestamps only order observations of the same deployment.
          ...(observation.deploymentId && observation.providerUpdatedAt
            ? {
                [Op.or]: [
                  { deploymentId: { [Op.is]: null } },
                  { deploymentId: { [Op.ne]: observation.deploymentId } },
                  { providerUpdatedAt: { [Op.is]: null } },
                  { providerUpdatedAt: { [Op.lte]: observation.providerUpdatedAt } },
                ],
              }
            : {}),
        },
      },
    );
    return count === 1;
  }

  async observationFailed(ticket: ObservationTicket, failure: Failure): Promise<void> {
    await this.model.update(
      { observationError: failure, revision: literal('revision + 1') },
      {
        where: {
          id: ticket.resourceId,
          generation: ticket.generation,
          observationSequence: ticket.sequence,
        },
      },
    );
  }
}
