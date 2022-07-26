module.exports = {
  extends: ["@hashintel/eslint-config/block"],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["tsconfig.json"],
  },
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@mui/material/Button",
            importNames: [],
          },
        ],
      },
    ],
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
