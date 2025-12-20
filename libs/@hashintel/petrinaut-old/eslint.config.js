import { createBase } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "assets.d.ts",
            "panda.config.ts",
            "postcss.config.cjs",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["dev/**/*"],
    languageOptions: {
      parserOptions: {
        projectService: {
          defaultProject: "./dev/tsconfig.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["dev/*.tsx"],
    rules: {
      "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
    },
  },
  {
    rules: {
      // Disabled because React Compiler handles optimization automatically
      "react/jsx-no-bind": "off",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@mui/material/*"],
              message: "Please import from @mui/material instead",
            },
            {
              group: ["@local/*"],
              message:
                "You cannot use unpublished local packages in a published package.",
            },
          ],
        },
      ],
    },
  },
];
