import { defineFlatConfig, FlatESLintConfig } from "eslint-define-config";

export const stylistic =
  () =>
  (config: FlatESLintConfig[]): FlatESLintConfig[] =>
    defineFlatConfig([
      ...config,
      {
        rules: {
          // Personal preference
          "@stylistic/yield-star-spacing": ["error", "after"],
          "@stylistic/generator-star-spacing": ["error", "after"],
        },
      },
    ]);
