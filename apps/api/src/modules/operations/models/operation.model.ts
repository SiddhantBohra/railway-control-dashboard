import { Column, DataType, Model, Table } from 'sequelize-typescript';
import type { Action, Failure, OperationState } from '@control/contracts';

export interface OperationRecord {
  id: string;
  resourceId: string;
  actorSubject: string;
  action: Action;
  generation: number;
  idempotencyKey: string;
  fingerprint: string;
  state: OperationState;
  targetDeploymentId: string | null;
  resultDeploymentId: string | null;
  baselineDeploymentIds: string[];
  dispatchAt: Date | null;
  acceptedAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  nextCheckAt: Date;
  deadlineAt: Date;
  attempts: number;
  revision: number;
  failure: Failure | null;
  outcome: 'applied' | 'already_satisfied' | null;
}

@Table({ tableName: 'operations', timestamps: false, underscored: true })
export class OperationModel extends Model<OperationRecord, OperationRecord> {
  @Column({ type: DataType.UUID, primaryKey: true }) declare id: string;
  @Column(DataType.UUID) declare resourceId: string;
  @Column(DataType.STRING) declare actorSubject: string;
  @Column(DataType.STRING) declare action: Action;
  @Column(DataType.INTEGER) declare generation: number;
  @Column(DataType.UUID) declare idempotencyKey: string;
  @Column(DataType.STRING) declare fingerprint: string;
  @Column(DataType.STRING) declare state: OperationState;
  @Column(DataType.STRING) declare targetDeploymentId: string | null;
  @Column(DataType.STRING) declare resultDeploymentId: string | null;
  @Column(DataType.JSONB) declare baselineDeploymentIds: string[];
  @Column(DataType.DATE) declare dispatchAt: Date | null;
  @Column(DataType.DATE) declare acceptedAt: Date;
  @Column(DataType.DATE) declare updatedAt: Date;
  @Column(DataType.DATE) declare completedAt: Date | null;
  @Column(DataType.DATE) declare nextCheckAt: Date;
  @Column(DataType.DATE) declare deadlineAt: Date;
  @Column(DataType.INTEGER) declare attempts: number;
  @Column(DataType.INTEGER) declare revision: number;
  @Column(DataType.JSONB) declare failure: Failure | null;
  @Column(DataType.STRING) declare outcome: 'applied' | 'already_satisfied' | null;
}
