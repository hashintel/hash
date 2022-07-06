// Source: https://nextjs.org/docs/testing#jest-and-react-testing-library

const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: __dirname });

const customJestConfig = {
  moduleDirectories: ["node_modules", "<rootDir>/"],
  moduleNameMapper: {
    "@hashintel/hash-shared(.*)": "<rootDir>/../shared/src$1",
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "jest-environment-jsdom",
};

module.exports = async () => {
  const nextJestConfig = await createJestConfig(customJestConfig)();
  // https://github.com/vercel/next.js/issues/36230
  nextJestConfig.moduleNameMapper = {
    // Workaround to put our SVG stub first
    "\\.svg": "<rootDir>/src/__mocks__/file.mock.ts",
    ...nextJestConfig.moduleNameMapper,
  };

  return nextJestConfig;
};
