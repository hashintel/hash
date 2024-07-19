import { create, defineFlatConfig } from "@local/eslint";

export default defineFlatConfig([
  ...create({
    enabled: {
      frontend: false,
      playwright: false,
      tests: false,
    },
    noRestrictedImports: () => [
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
  }),
  {
    rules: {
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
    },
  },
  {
    files: ["utils/*.js"],
    rules: {
      "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
    },
  },
]);
