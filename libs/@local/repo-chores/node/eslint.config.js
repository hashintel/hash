import { createBase, defineConfig } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  ...defineConfig([
    {
      rules: {
        "global-require": "off",
      },
    },
    {
      // The changelog formatter stays plain CommonJS, outside the TypeScript
      // project, because `changeset version` requires it with no build step in
      // front of it.
      files: ["changesets-changelog/**"],
      languageOptions: {
        parserOptions: {
          projectService: false,
          project: false,
        },
      },
      rules: {
        strict: "off",
        "unicorn/no-array-for-each": "off",
      },
    },
    { ignores: ["**/scripts/**/.eslintrc.cjs"] },
  ]),
];
