/** @jest-environment node */
import { z } from 'zod';
import { http } from './http';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

test.each(['timeout', 'cancellation'] as const)(
  'a query respects %s when both signals are present',
  async (source) => {
    const timeout = new AbortController();
    const cancellation = new AbortController();
    jest.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    global.fetch = jest.fn(
      (_input, options) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    );
    const result = http('/resources', z.object({}), { signal: cancellation.signal });
    const rejected = expect(result).rejects.toMatchObject({ code: 'CONNECTION_INTERRUPTED' });
    (source === 'timeout' ? timeout : cancellation).abort();
    await rejected;
    expect(AbortSignal.timeout).toHaveBeenCalledWith(20000);
  },
);
