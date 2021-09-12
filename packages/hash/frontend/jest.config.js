module.exports = {
  setupFilesAfterEnv: ["./jest.setup.ts"],
  testPathIgnorePatterns: ['./.next/', './node_modules/'],
  moduleNameMapper: {
      '\\.(scss|sass|css)$': 'identity-obj-proxy'
  }
};
