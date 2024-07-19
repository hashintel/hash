import { create, defineFlatConfig } from "@local/eslint";

export default defineFlatConfig([
  ...create({
    enabled: {
      frontend: false,
      playwright: false,
      tests: false,
    },
  }),
  {
    plugins: ["typescript-sort-keys"],
    rules: { "typescript-sort-keys/interface": "error" },
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
  },
]);
