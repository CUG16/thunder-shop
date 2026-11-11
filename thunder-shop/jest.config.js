/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  testTimeout: 30000,
  globalSetup: '<rootDir>/tests/helpers/globalSetup.ts',
  setupFiles: ['<rootDir>/tests/helpers/useTestDatabase.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/helpers/closePoolAfterTests.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          isolatedModules: true,
          strict: true,
          target: 'ES2022',
          baseUrl: '.',
          paths: { '@/*': ['./src/*'] },
        },
      },
    ],
  },
};
