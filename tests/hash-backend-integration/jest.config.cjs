/** @type {import('jest').Config} */
module.exports = {
  collectCoverage: process.env.TEST_COVERAGE === "true",
  collectCoverageFrom: [
    "**/*.{c,m,}{j,t}s{x,}",
    "!**/node_modules/**",
    "!**/dist/**",
  ],
  coverageReporters: ["lcov", "text"],
  testEnvironment: "node",
  moduleNameMapper: {
    "@local/hash-backend-utils(.*)":
      "<rootDir>/../../libs/@local/hash-backend-utils/src$1",
    "@local/hash-shared(.*)": "<rootDir>/../../libs/@local/hash-shared/src$1",
    "@hashintel/hash-subgraph(.*)": "<rootDir>/../../packages/hash/subgraph$1",
    "@hashintel/hash-graph-client":
      "<rootDir>/../../packages/graph/clients/typescript",
  },
  setupFiles: ["@local/hash-backend-utils/environment"],
  testMatch: [
    "<rootDir>/src/tests/model/knowledge/**",
    "<rootDir>/src/tests/graph/**",
  ],
};
