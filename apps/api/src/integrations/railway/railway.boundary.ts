export interface RailwayTarget {
  projectId: string;
  environmentId: string;
  serviceId: string;
  image: string;
}

export interface Deployment {
  id: string;
  status: string;
  updatedAt: string;
  createdAt: string;
  projectId: string;
  environmentId: string;
  serviceId: string | null;
  instances: { id: string; status: string }[];
}

export interface RailwaySnapshot {
  deployments: Deployment[];
  complete: boolean;
  observedAt: Date;
}

// Only the three operations this product actually uses are exposed.
export abstract class RailwayLifecycle {
  abstract snapshot(target: RailwayTarget): Promise<RailwaySnapshot>;
  abstract deployment(target: RailwayTarget, id: string): Promise<Deployment>;
  abstract start(target: RailwayTarget): Promise<string>;
  abstract remove(target: RailwayTarget, deploymentId: string): Promise<void>;
}

export class ProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly certainty: 'rejected' | 'unknown' = 'unknown',
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
  }
}
