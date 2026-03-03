import { createBase } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "panda.config.ts",
            "postcss.config.cjs",
            "vite.config.ts",
            "vite.site.config.ts",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["demo-site/**/*"],
    languageOptions: {
      parserOptions: {
        projectService: {
          defaultProject: "./demo-site/tsconfig.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["demo-site/**/*.tsx"],
    rules: {
      "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
    },
  },
  {
    rules: {
      // Disabled because React Compiler handles optimization automatically
      "react/jsx-no-bind": "off",
      "react/jsx-no-constructed-context-values": "off",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@local/*"],
              message:
                "You cannot use unpublished local packages in a published package.",
            },
          ],
        },
      ],
      "no-param-reassign": [
        "error",
        {
          props: true,
          ignorePropertyModificationsForRegex: ["^existing", "draft"],
        },
      ],
    },
  },
];
