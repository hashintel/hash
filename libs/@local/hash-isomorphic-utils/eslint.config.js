import { createBase, disableRules } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  ...disableRules([
    /* 2022-11-29:   6 */ "@typescript-eslint/no-unsafe-argument",
    /* 2022-11-29:  15 */ "@typescript-eslint/no-unsafe-assignment",
    /* 2022-11-29:   5 */ "@typescript-eslint/no-unsafe-call",
    /* 2022-11-29:   7 */ "@typescript-eslint/no-unsafe-member-access",
    /* 2022-11-29:   7 */ "@typescript-eslint/no-unsafe-return",
  ]),
  {
    rules: {
      "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
    },
  },
  {
    files: ["**/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@local/hash-backend-utils/*"],
              message:
                "This package is shared by FE and BE, move backend utils here if both need them.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/src/system-types/**"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
];
