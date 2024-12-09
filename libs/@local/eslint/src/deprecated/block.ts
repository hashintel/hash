import getGitignorePatterns from "eslint-config-flat-gitignore";
import { ignores } from "eslint-config-sheriff";
import react from "eslint-plugin-react";
// @ts-expect-error - react-hooks does not expose types
import reactHooks from "eslint-plugin-react-hooks";
import unicorn from "eslint-plugin-unicorn";
import { fixupPluginRules } from "@eslint/compat";
import typescriptEslint from "@typescript-eslint/eslint-plugin";

export const create = () =>
  [
    {
      plugins: {
        "@typescript-eslint": typescriptEslint,
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-argument */
        "react-hooks": fixupPluginRules(reactHooks),
        react,
        unicorn,
      },

      rules: {
        curly: ["error", "multi-line"],

        "import/no-extraneous-dependencies": [
          "error",
          {
            devDependencies: true,
          },
        ],

        "jsx-a11y/label-has-associated-control": "off",
        "react-hooks/exhaustive-deps": "error",
        "react-hooks/rules-of-hooks": "error",
        "react/jsx-key": "error",
        "react/jsx-no-useless-fragment": "error",
        "react/no-danger": "error",
        "react/self-closing-comp": "error",
      },
    },
    getGitignorePatterns({ strict: false }),
    {
      ignores,
    },
  ] as readonly ESConfig[];
