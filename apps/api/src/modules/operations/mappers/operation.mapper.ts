import type { Operation } from '@control/contracts';
import type { OperationRecord } from '../models/operation.model';

export function toOperation(record: OperationRecord): Operation {
  return {
    id: record.id,
    resourceId: record.resourceId,
    action: record.action,
    state: record.state,
    acceptedAt: record.acceptedAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    deploymentId: record.resultDeploymentId ?? record.targetDeploymentId,
    failure: record.failure,
    outcome: record.outcome,
    revision: record.revision,
  };
}
