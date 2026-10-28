import { Inject, Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type { Transaction } from 'sequelize';
import { OperationModel } from '../models/operation.model';
import type { OperationRecord } from '../models/operation.model';
import { UNRESOLVED_STATES } from '../domain/lifecycle';

const attributes: (keyof OperationRecord)[] = [
  'id',
  'resourceId',
  'actorSubject',
  'action',
  'generation',
  'idempotencyKey',
  'fingerprint',
  'state',
  'targetDeploymentId',
  'resultDeploymentId',
  'baselineDeploymentIds',
  'dispatchAt',
  'acceptedAt',
  'updatedAt',
  'completedAt',
  'nextCheckAt',
  'deadlineAt',
  'attempts',
  'revision',
  'failure',
  'outcome',
];
export interface HistoryCursor {
  acceptedAt: string;
  id: string;
}

@Injectable()
export class OperationsRepository {
  constructor(
    @InjectModel(OperationModel) private readonly model: typeof OperationModel,
    @Inject(Sequelize) private readonly db: Sequelize,
  ) {}

  async find(id: string, actor: string): Promise<OperationRecord | null> {
    return (
      (await this.model.findOne({ where: { id, actorSubject: actor }, attributes }))?.get({
        plain: true,
      }) ?? null
    );
  }
  async byKey(
    actor: string,
    idempotencyKey: string,
    transaction: Transaction,
  ): Promise<OperationRecord | null> {
    return (
      (
        await this.model.findOne({
          where: { actorSubject: actor, idempotencyKey },
          attributes,
          transaction,
        })
      )?.get({ plain: true }) ?? null
    );
  }
  async unresolved(resourceId: string, transaction?: Transaction): Promise<OperationRecord | null> {
    return (
      (
        await this.model.findOne({
          where: { resourceId, state: { [Op.in]: UNRESOLVED_STATES } },
          attributes,
          ...(transaction ? { transaction } : {}),
        })
      )?.get({ plain: true }) ?? null
    );
  }
  async create(record: OperationRecord, transaction: Transaction): Promise<OperationRecord> {
    return (await this.model.create(record, { transaction })).get({ plain: true });
  }
  async due(now: Date): Promise<OperationRecord | null> {
    return (
      (
        await this.model.findOne({
          where: {
            state: { [Op.in]: ['queued', 'dispatching', 'reconciling'] },
            nextCheckAt: { [Op.lte]: now },
          },
          attributes,
          order: [
            ['nextCheckAt', 'ASC'],
            ['id', 'ASC'],
          ],
        })
      )?.get({ plain: true }) ?? null
    );
  }

  async update(
    record: OperationRecord,
    changes: Partial<
      Omit<
        OperationRecord,
        | 'id'
        | 'resourceId'
        | 'actorSubject'
        | 'idempotencyKey'
        | 'fingerprint'
        | 'action'
        | 'generation'
      >
    >,
    transaction?: Transaction,
  ): Promise<OperationRecord | null> {
    const [count, rows] = await this.model.update(
      { ...changes, revision: record.revision + 1, updatedAt: new Date() },
      {
        where: { id: record.id, revision: record.revision, state: record.state },
        returning: true,
        ...(transaction ? { transaction } : {}),
      },
    );
    return count === 1 ? (rows[0]?.get({ plain: true }) ?? null) : null;
  }

  async recordReview(
    record: OperationRecord,
    reason: string,
    transaction: Transaction,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO operation_reviews (operation_id, actor_subject, reason, reviewed_at, prior_revision, prior_failure)
       VALUES ($id, $actor, $reason, $at, $revision, $failure::jsonb)`,
      {
        transaction,
        bind: {
          id: record.id,
          actor: record.actorSubject,
          reason,
          at: new Date(),
          revision: record.revision,
          failure: JSON.stringify(record.failure),
        },
      },
    );
  }

  async history(
    resourceId: string,
    actor: string,
    limit: number,
    cursor: HistoryCursor | null,
  ): Promise<OperationRecord[]> {
    const rows = await this.model.findAll({
      where: {
        resourceId,
        actorSubject: actor,
        ...(cursor
          ? {
              [Op.or]: [
                { acceptedAt: { [Op.lt]: new Date(cursor.acceptedAt) } },
                { acceptedAt: new Date(cursor.acceptedAt), id: { [Op.lt]: cursor.id } },
              ],
            }
          : {}),
      },
      attributes,
      order: [
        ['acceptedAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: limit + 1,
    });
    return rows.map((row) => row.get({ plain: true }));
  }
}
