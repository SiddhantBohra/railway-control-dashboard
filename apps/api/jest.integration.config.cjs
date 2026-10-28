process.env.NODE_ENV = 'test';
module.exports = {
  ...require('./jest.config.cjs'),
  testMatch: ['<rootDir>/test/**/*.integration.spec.ts'],
  testTimeout: 30000,
};
