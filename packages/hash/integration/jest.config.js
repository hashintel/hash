/** @type {import('@ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  // recreating DB takes longer than the default 5 seconds.
  // The chosen default give a lot of room to the integration test.
  testTimeout: 60000,
  moduleNameMapper: {
    "@hashintel/hash-backend-utils(.*)": "<rootDir>/../backend-utils/src$1",
    "@hashintel/hash-shared(.*)": "<rootDir>/../shared/src$1",
  },
};
