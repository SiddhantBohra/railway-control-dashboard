import { Column, DataType, Model, Table } from 'sequelize-typescript';
import type { Failure, ObservedState } from '@control/contracts';

export interface ResourceRecord {
  id: string;
  ownerSubject: string;
  name: string;
  mode: 'mock' | 'railway';
  projectId: string;
  environmentId: string;
  serviceId: string;
  image: string;
  intendedState: 'running' | 'stopped' | null;
  generation: number;
  revision: number;
  observationSequence: number;
  observedState: ObservedState;
  providerStatus: string | null;
  deploymentId: string | null;
  observedAt: Date | null;
  providerUpdatedAt: Date | null;
  observationError: Failure | null;
}

@Table({ tableName: 'managed_resources', timestamps: false, underscored: true })
export class ResourceModel extends Model<ResourceRecord, ResourceRecord> {
  @Column({ type: DataType.UUID, primaryKey: true }) declare id: string;
  @Column(DataType.STRING) declare ownerSubject: string;
  @Column(DataType.STRING) declare name: string;
  @Column(DataType.STRING) declare mode: 'mock' | 'railway';
  @Column(DataType.STRING) declare projectId: string;
  @Column(DataType.STRING) declare environmentId: string;
  @Column(DataType.STRING) declare serviceId: string;
  @Column(DataType.STRING) declare image: string;
  @Column(DataType.STRING) declare intendedState: 'running' | 'stopped' | null;
  @Column(DataType.INTEGER) declare generation: number;
  @Column(DataType.INTEGER) declare revision: number;
  @Column(DataType.INTEGER) declare observationSequence: number;
  @Column(DataType.STRING) declare observedState: ObservedState;
  @Column(DataType.STRING) declare providerStatus: string | null;
  @Column(DataType.STRING) declare deploymentId: string | null;
  @Column(DataType.DATE) declare observedAt: Date | null;
  @Column(DataType.DATE) declare providerUpdatedAt: Date | null;
  @Column(DataType.JSONB) declare observationError: Failure | null;
}
