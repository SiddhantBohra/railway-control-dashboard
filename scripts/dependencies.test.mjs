import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { URL } from 'node:url';

// Exercise the exact patched transitive dependency loaded by the API.
const api = createRequire(new URL('../apps/api/package.json', import.meta.url));
const dependency = createRequire(api.resolve('nestjs-zod'));
const merge = dependency('deepmerge');

test('deepmerge cannot poison returned prototypes through either merge operand', () => {
  const malicious = JSON.parse('{"__proto__":{"injected":true}}');
  for (const result of [merge(malicious, {}), merge(Object.create(null), malicious)]) {
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal(result.injected, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(result, '__proto__'), true);
  }
  const nested = merge({ schemas: [malicious] }, {});
  assert.equal(Object.getPrototypeOf(nested.schemas[0]), Object.prototype);
  assert.equal(nested.schemas[0].injected, undefined);
});

test('patched merging preserves ordinary schema properties and symbol keys', () => {
  const symbol = Symbol('metadata');
  const result = merge(
    { properties: { id: { type: 'string' } }, [symbol]: 'kept' },
    {
      properties: { status: { type: 'string' } },
    },
  );
  assert.deepEqual(result.properties, { id: { type: 'string' }, status: { type: 'string' } });
  assert.equal(result[symbol], 'kept');
});
