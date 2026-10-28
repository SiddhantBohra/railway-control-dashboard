'use client';

import { useQuery } from '@tanstack/react-query';
import { SessionSchema } from '@control/contracts';
import { http } from '@/lib/http';

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: ({ signal }) => http('/auth/session', SessionSchema, { signal }),
    staleTime: 30000,
  });
}
