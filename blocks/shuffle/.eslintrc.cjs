module.exports = {
  extends: ["@hashintel/eslint-config/block"],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["tsconfig.json"],
  },
  rules: {
    "unicorn/import-style": [
      "error",
      {
        styles: {
          react: { named: false },
        },
      },
    ],
  },
};
