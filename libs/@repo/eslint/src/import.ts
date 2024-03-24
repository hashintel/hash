import { defineFlatConfig, FlatESLintConfig } from "eslint-define-config";

export const import_ =
  () =>
  (config: FlatESLintConfig[]): FlatESLintConfig[] =>
    defineFlatConfig([
      ...config,
      {
        rules: {
          "import/order": ["error", { "newlines-between": "always" }],
        },
      },
    ]);
