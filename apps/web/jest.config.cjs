const nextJest = require('next/jest');
module.exports = nextJest({ dir: './' })({
  testEnvironment: 'jsdom',
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@control/contracts$': '<rootDir>/../../packages/contracts/src',
  },
});
