import { defineFlatConfig, type FlatESLintConfig } from "eslint-define-config";

export const importPlugin = (config: FlatESLintConfig[]): FlatESLintConfig[] =>
  defineFlatConfig([
    ...config,
    {
      rules: {
        "import/order": ["error", { "newlines-between": "always" }],
        "import/no-useless-path-segments": ["error", { noUselessIndex: false }],
      },
    },
  ]);
