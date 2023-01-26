/** @type {import('jest').Config} */
module.exports = {
  collectCoverage: process.env.TEST_COVERAGE === "true",
  collectCoverageFrom: [
    "**/*.{c,m,}{j,t}s{x,}",
    "!**/node_modules/**",
    "!**/dist/**",
  ],
  coverageReporters: ["lcov", "text"],
  preset: "ts-jest",
  testEnvironment: "node",
  // recreating DB takes longer than the default 5 seconds.
  // The chosen default give a lot of room to the integration test.
  testTimeout: 60000,
  moduleNameMapper: {
    "@local/hash-graph-client": "<rootDir>/../hash-graph-client",
  },
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
};
