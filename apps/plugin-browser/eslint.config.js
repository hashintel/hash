import { createBase } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  {
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
          patterns: [
            {
              group: ["*use-user-value"],
              message:
                "Please useUserContext instead to share state across components",
            },
          ],
        },
      ],
      /**
       * Importing the StatusCode enum interferes with Playwright test setup for some reason.
       */
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
    },
  },
  {
    files: ["utils/*.js"],
    rules: {
      "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
    },
  },
  {
    ignores: ["webpack.config.js", "utils/webserver.js", "utils/build.js"],
  },
];
