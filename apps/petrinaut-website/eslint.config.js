import { createBase } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["vite.config.ts"],
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
    },
  },
];
