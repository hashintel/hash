/** @type {import('@ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "@hashintel/hash-backend-utils(.*)": "<rootDir>/../backend-utils/src$1",
  },
};
