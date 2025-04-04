import { createBase, disableRules } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  ...disableRules([
    /* 2022-11-29:  13 */ "@typescript-eslint/no-unsafe-assignment",
    /* 2022-11-29:  13 */ "@typescript-eslint/no-unsafe-member-access",
    /* 2022-11-29:  11 */ "@typescript-eslint/restrict-template-expressions",
  ]),
  {
    rules: {
      "jsx-a11y/label-has-associated-control": "off",
      "import/no-default-export": "error",
    },
  },
  {
    files: [
      "**/src/pages/**/*.page.ts",
      "**/src/pages/**/*.page.tsx",
      "**/__mocks__/**",
      "*.stories.ts",
      "*.stories.tsx",
    ],
    rules: {
      "import/no-default-export": "off",
    },
  },
  {
    files: ["**/scripts/**/*.ts"],
    rules: {
      "import/no-extraneous-dependencies": [
        "error",
        {
          // Allow scripts to be able to import from dev dependencies
          devDependencies: true,
        },
      ],
    },
  },
  {
    ignores: ["buildstamp.js", "next.config.js"],
  },
];
