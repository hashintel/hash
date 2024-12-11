import { createBase, defineConfig } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  ...defineConfig([
    {
      rules: {
        "global-require": "off",
      },
    },
    { ignores: ["**/scripts/**/.eslintrc.cjs"] },
  ]),
];
