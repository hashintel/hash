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
      "no-console": "off",
    },
  },
]);
