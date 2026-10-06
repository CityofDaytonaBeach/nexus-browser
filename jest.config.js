module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/.chromium-source/', '<rootDir>/generated-apps/', '<rootDir>/.nexus/'],
  testPathIgnorePatterns: ['<rootDir>/.chromium-source/', '<rootDir>/generated-apps/', '<rootDir>/.nexus/'],
  clearMocks: true,
};
