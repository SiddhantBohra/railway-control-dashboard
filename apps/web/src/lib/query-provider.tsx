'use client';

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { HttpError } from './http';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    const client = new QueryClient({
      queryCache: new QueryCache({
        onError: (error, query) => {
          if (
            error instanceof HttpError &&
            error.status === 401 &&
            query.queryKey[0] !== 'session'
          ) {
            void client.invalidateQueries({ queryKey: ['session'] });
          }
        },
      }),
      defaultOptions: {
        queries: {
          staleTime: 10000,
          refetchOnWindowFocus: true,
          refetchOnReconnect: true,
          refetchIntervalInBackground: false,
          retry: (count, error) =>
            count < 2 &&
            (!(error instanceof HttpError) || error.status === 0 || error.status >= 500),
        },
        mutations: { retry: false },
      },
    });
    return client;
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
