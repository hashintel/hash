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
};
