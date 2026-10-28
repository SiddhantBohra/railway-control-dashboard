import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import console from 'node:console';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { hash, argon2id } = require('argon2');
const template = await readFile(new URL('../apps/api/.env.example', import.meta.url), 'utf8');
const passwordHash = await hash('local-demo-only', { type: argon2id });
const contents = template
  .replace('replace-with-at-least-32-random-characters', randomBytes(32).toString('hex'))
  .replace('generate-with-pnpm-password-hash', passwordHash);
try {
  await writeFile(new URL('../apps/api/.env', import.meta.url), contents, {
    flag: 'wx',
    mode: 0o600,
  });
  console.info('Created local mock configuration. Login: demo / local-demo-only');
} catch (error) {
  if (error?.code !== 'EEXIST') throw error;
  console.info('Existing apps/api/.env preserved.');
}
