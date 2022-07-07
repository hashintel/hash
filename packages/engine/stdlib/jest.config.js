module.exports = {
  globals: {
    "ts-jest": {
      // Disable type checking when running tests
      // https://kulshekhar.github.io/ts-jest/docs/getting-started/options/isolatedModules
      isolatedModules: true,
    },
  },
  roots: ["src/ts"],
  testMatch: [
    "**/__tests__/**/*.+(ts|tsx|js)",
    "**/?(*.)+(spec|test).+(ts|tsx|js)",
  ],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
  testPathIgnorePatterns: ["src/ts/dist"],
};
