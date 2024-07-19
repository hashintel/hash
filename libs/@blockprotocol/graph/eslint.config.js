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
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);
