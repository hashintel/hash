import { create, defineFlatConfig } from "@local/eslint";

// eslint-disable-next-line import/no-default-export
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
      "jsx-a11y/label-has-associated-control": "off",
      "import/no-default-export": "error",
    },
  },
  {
    files: [
      "./src/pages/**/*.page.ts",
      "./src/pages/**/*.page.tsx",
      "**/__mocks__/**",
      "*.stories.ts",
      "*.stories.tsx",
    ],
    rules: {
      "import/no-default-export": "off",
    },
  },
  {
    files: ["./scripts/**/*.ts"],
    rules: {
      "import/no-extraneous-dependencies": [
        "error",
        {
          //  Allow scripts to be able to import from dev dependencies
          devDependencies: true,
        },
      ],
    },
  },
]);
