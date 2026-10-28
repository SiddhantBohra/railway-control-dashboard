import { observedState } from './lifecycle';
import { deployment } from '../../../../test/fixtures';

test('incomplete evidence never becomes stopped', () => {
  expect(observedState({ deployments: [], complete: false, observedAt: new Date() })).toBe(
    'unknown',
  );
});
test('SUCCESS without a running instance is not proof of running', () => {
  expect(
    observedState({
      deployments: [deployment({ instances: [] })],
      complete: true,
      observedAt: new Date(),
    }),
  ).toBe('unknown');
});
test('multiple live deployments are ambiguous', () => {
  expect(
    observedState({
      deployments: [deployment(), deployment({ id: 'other' })],
      complete: true,
      observedAt: new Date(),
    }),
  ).toBe('unknown');
});
test('known transitions, absence and future provider statuses remain distinct', () => {
  const state = (status: string) =>
    observedState({
      deployments: [deployment({ status })],
      complete: true,
      observedAt: new Date(),
    });
  expect(state('DEPLOYING')).toBe('transitioning');
  expect(state('REMOVED')).toBe('stopped');
  expect(state('FAILED')).toBe('failed');
  expect(state('CRASHED')).toBe('failed');
  expect(state('FUTURE_STATUS')).toBe('unknown');
});
