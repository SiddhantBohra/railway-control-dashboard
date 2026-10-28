import pino from 'pino';

export const logger = pino({
  level: process.env['NODE_ENV'] === 'test' ? 'silent' : 'info',
  redact: {
    paths: [
      'password',
      'token',
      'secret',
      'cookie',
      'authorization',
      'databaseUrl',
      'req.headers',
      'res.headers',
      'err',
      '*.password',
      '*.token',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
});
