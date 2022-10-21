/** @type {import('jest').Config} */
module.exports = {
  collectCoverage: process.env.COVERAGE === "true",
  collectCoverageFrom: [
    "**/*.{c,m,}{j,t}s{x,}",
    "!**/node_modules/**",
    "!**/dist/**",
  ],
  coverageReporters: ["lcov", "text"],
  moduleNameMapper: {
    "@hashintel/hash-shared(.*)": "<rootDir>/../shared/src$1",
  },
  preset: "ts-jest",
  testEnvironment: "node",
};
