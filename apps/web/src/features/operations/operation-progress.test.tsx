import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Operation } from '@control/contracts';
import { OperationProgress } from './operation-progress';

const operation: Operation = {
  id: '8121a177-2708-4d18-91ee-8f1f2cedb2ee',
  resourceId: '3b705c6a-d850-4e52-bdc3-1cbb10954f62',
  action: 'start',
  state: 'reconciling',
  acceptedAt: '2026-10-28T10:00:00.000Z',
  updatedAt: '2026-10-28T10:00:00.000Z',
  completedAt: null,
  deploymentId: null,
  failure: null,
  outcome: null,
  revision: 1,
};
function show(value: Operation) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <OperationProgress operation={value} csrfToken="csrf" />
    </QueryClientProvider>,
  );
}

test('accepted work is presented as confirmation in progress, not provider success', () => {
  show(operation);
  expect(screen.getByText('Confirming state')).toBeVisible();
  expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  expect(screen.getByText(/request is saved/)).toBeVisible();
});
test('uncertain outcomes explain the limitation and offer only a read-only recheck', () => {
  show({
    ...operation,
    state: 'review_required',
    failure: { code: 'DISPATCH_OUTCOME_UNKNOWN', message: 'The outcome could not be correlated.' },
  });
  expect(screen.getByText('Needs review')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Recheck provider state' })).toBeVisible();
  expect(screen.getByText(/mutation will not be repeated/)).toBeVisible();
});
