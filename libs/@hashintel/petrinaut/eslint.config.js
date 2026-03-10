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
            ".storybook/main.ts",
            ".storybook/manager.tsx",
            ".storybook/preview.tsx",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // Disabled because React Compiler handles optimization automatically
      "react/jsx-no-bind": "off",
      "react/jsx-no-constructed-context-values": "off",
      "react-hooks/exhaustive-deps": "off",
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
