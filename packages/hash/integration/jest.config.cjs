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
    "@hashintel/hash-backend-utils(.*)": "<rootDir>/../backend-utils/src$1",
    "@hashintel/hash-shared(.*)": "<rootDir>/../shared/src$1",
    "@hashintel/hash-subgraph(.*)": "<rootDir>/../subgraph/src$1",
    "@hashintel/hash-graph-client": "<rootDir>/../../graph/clients/typescript",
  },
  testMatch: [
    "<rootDir>/src/tests/model/knowledge/**",
    "<rootDir>/src/tests/model/ontology/**",
  ],
};
