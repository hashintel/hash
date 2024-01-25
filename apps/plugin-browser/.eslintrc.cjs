/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@local/hash-isomorphic-utils/environment",
            message: "Use the API_ORIGIN or FRONTEND_ORIGIN globals instead.",
          },
        ],
      },
    ],
    /**
     * Importing the StatusCode enum interferes with Playwright test setup for some reason.
     */
    "@typescript-eslint/no-unsafe-enum-comparison": "off",
  },
  ignorePatterns: require("@local/eslint-config/generate-ignore-patterns.cjs")(
    __dirname,
  ),
  overrides: [
    {
      files: ["utils/*.js"],
      rules: {
        "import/no-extraneous-dependencies": [
          "error",
          { devDependencies: true },
        ],
      },
    },
  ],
};
