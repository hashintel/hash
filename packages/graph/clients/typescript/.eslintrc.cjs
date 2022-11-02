module.exports = {
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["tsconfig.json"],
  },
  plugins: ["typescript-sort-keys"],
  rules: {
    "typescript-sort-keys/interface": "error",
  },
};
