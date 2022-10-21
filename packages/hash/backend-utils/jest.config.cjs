/** @type {import('jest').Config} */
module.exports = {
  collectCoverage: process.env.COVERAGE === "true",
  coverageReporters: ["lcov", "text"],
  preset: "ts-jest",
  testEnvironment: "node",
};
