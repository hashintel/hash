// Source: https://nextjs.org/docs/testing#jest-and-react-testing-library

const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: __dirname });

const customJestConfig = {
  moduleDirectories: ["node_modules", "<rootDir>/"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "jest-environment-jsdom",
};

module.exports = createJestConfig(customJestConfig);
