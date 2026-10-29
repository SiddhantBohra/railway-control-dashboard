import { act, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ResourceSchema } from '@control/contracts';
import { http, HttpError } from '@/lib/http';
import { ResourceDashboard } from './resource-dashboard';

jest.mock('@/lib/http', () => ({ ...jest.requireActual('@/lib/http'), http: jest.fn() }));
const request = jest.mocked(http);
const resource = () =>
  ResourceSchema.parse({
    id: '3b705c6a-d850-4e52-bdc3-1cbb10954f62',
    name: 'Signal demo',
    mode: 'mock',
    intendedState: 'running',
    observedState: 'running',
    providerStatus: 'SUCCESS',
    deploymentId: 'active',
    observedAt: new Date().toISOString(),
    stale: false,
    observationError: null,
    generation: 1,
    revision: 1,
    stopBehavior: 'remove_deployment',
  });
let client: QueryClient;
beforeEach(() => {
  request.mockReset();
  sessionStorage.clear();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => {
  client.clear();
  jest.useRealTimers();
});

function dashboard() {
  return render(
    <QueryClientProvider client={client}>
      <ResourceDashboard
        session={{ authenticated: true, username: 'demo', csrfToken: 'test-token' }}
      />
    </QueryClientProvider>,
  );
}

test('refresh failures preserve last-known evidence, disable controls, and recover on success', async () => {
  const current = resource();
  let unavailable = false;
  request.mockImplementation(async (path) => {
    if (path === '/resources') {
      if (unavailable) throw new HttpError(503, 'API_UNAVAILABLE', 'Refresh failed');
      return { resources: [current] };
    }
    return { operations: [], nextCursor: null };
  });
  dashboard();
  const stop = await screen.findByRole('button', { name: 'Stop workload' });
  await waitFor(() => expect(stop).toBeEnabled());
  unavailable = true;
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['resources'] });
  });
  await waitFor(() => expect(stop).toBeDisabled());
  expect(screen.getByText('Last seen running')).toBeVisible();
  expect(screen.getByText('active')).toBeVisible();
  unavailable = false;
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['resources'] });
  });
  await waitFor(() => expect(stop).toBeEnabled());
  expect(screen.getByText('Running', { selector: '.status' })).toBeVisible();
});

test('cached observations age out even while a refresh is stalled', async () => {
  const current = resource();
  request.mockImplementation(async (path) =>
    path === '/resources' ? { resources: [current] } : { operations: [], nextCursor: null },
  );
  jest.useFakeTimers();
  const view = dashboard();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(10);
  });
  const workload = screen.getByRole('region', { name: 'Signal demo' });
  expect(within(workload).getByRole('button', { name: 'Stop workload' })).toBeEnabled();
  request.mockImplementation(async (path) =>
    path === '/resources' ? new Promise(() => undefined) : { operations: [], nextCursor: null },
  );
  await act(async () => {
    await jest.advanceTimersByTimeAsync(180000);
  });
  expect(within(workload).getByRole('button', { name: 'Stop workload' })).toBeDisabled();
  expect(within(workload).getByText('Last seen running')).toBeVisible();
  view.unmount();
});

test('a failed replacement is shown separately from the active deployment', async () => {
  const current = resource();
  current.latestDeployment = {
    id: 'failed-replacement',
    status: 'FAILED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  request.mockImplementation(async (path) =>
    path === '/resources' ? { resources: [current] } : { operations: [], nextCursor: null },
  );
  dashboard();
  expect(await screen.findByText('failed-replacement')).toBeVisible();
  expect(screen.getByText('active', { exact: true })).toBeVisible();
  expect(screen.getByText('SUCCESS', { exact: true })).toBeVisible();
});
