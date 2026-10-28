'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  OperationListSchema,
  OperationResultSchema,
  OperationSchema,
  ResourceListSchema,
} from '@control/contracts';
import type { Action, Operation } from '@control/contracts';
import { http } from '@/lib/http';

export function pending(operation: Operation | undefined): boolean {
  return !!operation && !['succeeded', 'failed'].includes(operation.state);
}

export function useResources() {
  return useQuery({
    queryKey: ['resources'],
    queryFn: ({ signal }) => http('/resources', ResourceListSchema, { signal }),
    refetchInterval: 30000,
  });
}
export function useHistory(resourceId: string) {
  return useInfiniteQuery({
    queryKey: ['history', resourceId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      http(
        `/resources/${resourceId}/operations?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        OperationListSchema,
        { signal },
      ),
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 15000,
  });
}
export function useOperation(latest: Operation | undefined) {
  return useQuery({
    queryKey: ['operation', latest?.id],
    enabled: !!latest,
    queryFn: ({ signal }) => http(`/operations/${latest?.id}`, OperationSchema, { signal }),
    refetchInterval: (query) => {
      const operation = query.state.data ?? latest;
      if (
        !operation ||
        !pending(operation) ||
        operation.state === 'review_required' ||
        Date.now() - Date.parse(operation.updatedAt) > 600000
      )
        return false;
      return 2000;
    },
  });
}
export function useCommand(resourceId: string, csrfToken: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ action, key }: { action: Action; key: string }) =>
      http(`/resources/${resourceId}/operations`, OperationResultSchema, {
        method: 'POST',
        body: { action },
        csrfToken,
        idempotencyKey: key,
      }),
    onSuccess: async ({ operation }) => {
      client.setQueryData(['operation', operation.id], operation);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['resources'] }),
        client.invalidateQueries({ queryKey: ['history', resourceId] }),
      ]);
    },
  });
}
