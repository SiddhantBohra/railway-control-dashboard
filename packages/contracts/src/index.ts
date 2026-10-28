import { z } from 'zod';

export const ActionSchema = z.enum(['start', 'stop']);
export const OperationStateSchema = z.enum([
  'queued',
  'dispatching',
  'reconciling',
  'succeeded',
  'failed',
  'review_required',
]);
export const ObservedStateSchema = z.enum([
  'running',
  'stopped',
  'transitioning',
  'sleeping',
  'failed',
  'unknown',
]);
export const FailureSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
});
export const ResourceSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  mode: z.enum(['mock', 'railway']),
  intendedState: z.enum(['running', 'stopped']).nullable(),
  observedState: ObservedStateSchema,
  providerStatus: z.string().nullable(),
  deploymentId: z.string().nullable(),
  observedAt: z.iso.datetime().nullable(),
  stale: z.boolean(),
  observationError: FailureSchema.nullable(),
  generation: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  stopBehavior: z.literal('remove_deployment'),
});
export const ResourceListSchema = z.strictObject({ resources: z.array(ResourceSchema) });
export const OperationSchema = z.strictObject({
  id: z.uuid(),
  resourceId: z.uuid(),
  action: ActionSchema,
  state: OperationStateSchema,
  acceptedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  deploymentId: z.string().nullable(),
  failure: FailureSchema.nullable(),
  outcome: z.enum(['applied', 'already_satisfied']).nullable(),
  revision: z.number().int().nonnegative(),
});
export const OperationResultSchema = z.strictObject({
  operation: OperationSchema,
  replayed: z.boolean(),
});
export const OperationListSchema = z.strictObject({
  operations: z.array(OperationSchema),
  nextCursor: z.string().nullable(),
});
export const CommandSchema = z.strictObject({ action: ActionSchema });
export const ResourceParamsSchema = z.strictObject({ resourceId: z.uuid() });
export const OperationParamsSchema = z.strictObject({ operationId: z.uuid() });
export const EmptySchema = z.strictObject({});
export const HistoryQuerySchema = z.strictObject({
  limit: z
    .string()
    .regex(/^(?:[1-9]|[1-4][0-9]|50)$/)
    .optional(),
  cursor: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .max(512)
    .optional(),
});
export const IdempotencyKeySchema = z.uuid();
export const ErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    issues: z.array(z.strictObject({ path: z.string(), message: z.string() })).optional(),
    operationId: z.uuid().optional(),
  }),
});
export const LoginSchema = z.strictObject({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(256),
});
export const SessionSchema = z.strictObject({
  authenticated: z.boolean(),
  username: z.string().nullable(),
  csrfToken: z.string(),
});
export const HealthSchema = z.strictObject({ status: z.enum(['ok', 'unavailable']) });

export type Action = z.infer<typeof ActionSchema>;
export type OperationState = z.infer<typeof OperationStateSchema>;
export type ObservedState = z.infer<typeof ObservedStateSchema>;
export type Resource = z.infer<typeof ResourceSchema>;
export type Operation = z.infer<typeof OperationSchema>;
export type Failure = z.infer<typeof FailureSchema>;
export type ApiError = z.infer<typeof ErrorSchema>;
export type Session = z.infer<typeof SessionSchema>;
