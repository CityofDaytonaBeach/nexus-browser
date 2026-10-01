module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/.chromium-source/'],
  testPathIgnorePatterns: ['<rootDir>/.chromium-source/'],
  clearMocks: true,
};
