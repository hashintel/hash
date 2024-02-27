/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  testEnvironment: "node",
  transformIgnorePatterns: ["/node_modules/"],
  transform: {
    "^.+\\.ts?$": "ts-jest",
  },
};
