module.exports = {
  extends: ["@hashintel/eslint-config/block"],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["tsconfig.json"],
  },
};
