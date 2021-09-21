module.exports = {
  roots: ["<rootDir>"],
  rootDir: "./src", 
  setupFilesAfterEnv: ["../jest.setup.ts"],
  testEnvironment: "jsdom",
  moduleFileExtensions: ["ts", "tsx", "js", "json", "jsx"],
  transform: {
    "^.+\\.(ts|tsx)$": "babel-jest",
  },
  watchPlugins: [
    "jest-watch-typeahead/filename",
    "jest-watch-typeahead/testname",
  ],
  modulePaths: ["<rootDir>"],
  moduleNameMapper: {
    "\\.(css|less|sass|scss)$": "identity-obj-proxy",
    "\\.(gif|ttf|eot|svg|png)$": "<rootDir>/tests/__mocks__/fileMock.ts",
  },
  verbose: true,
};
