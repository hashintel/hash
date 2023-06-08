/** @type {import('jest').Config} */
module.exports = {
  collectCoverage: process.env.TEST_COVERAGE === "true",
  collectCoverageFrom: [
    "**/*.{c,m,}{j,t}s{x,}",
    "!**/node_modules/**",
    "!**/dist/**",
    "!**/src/collab/**",
  ],
  coverageReporters: ["lcov", "text"],
  moduleNameMapper: {
    "@local/hash-graphql-shared(.*)":
      "<rootDir>/../../libs/@local/hash-graphql-shared/src$1",
    "@local/hash-isomorphic-utils(.*)":
      "<rootDir>/../../libs/@local/hash-isomorphic-utils/src$1",
  },
  preset: "ts-jest",
  testEnvironment: "node",
};
