import { createBase, disableRules } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  {
    rules: {
      "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
    },
  },
];
