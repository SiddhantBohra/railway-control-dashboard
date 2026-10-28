import { hash, argon2id } from 'argon2';

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    if (Buffer.isBuffer(chunk)) chunks.push(chunk);
    else if (typeof chunk === 'string') chunks.push(Buffer.from(chunk));
    if (Buffer.concat(chunks).length > 1024) throw new Error('Password too long');
  }
  const password = Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
  if (password.length < 12 || password.length > 256)
    throw new Error('Use a password between 12 and 256 characters');
  console.info(await hash(password, { type: argon2id }));
}
main().catch(() => {
  console.error('Read a 12–256 character password from standard input.');
  process.exitCode = 1;
});
