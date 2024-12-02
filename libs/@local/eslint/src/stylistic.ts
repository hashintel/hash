import { defineFlatConfig, type FlatESLintConfig } from "eslint-define-config";

export const stylistic = (config: FlatESLintConfig[]): FlatESLintConfig[] =>
  defineFlatConfig([
    ...config,
    {
      rules: {
        // Personal preference
        "@stylistic/yield-star-spacing": ["error", "after"],
        "@stylistic/generator-star-spacing": ["error", "after"],
        // Forces multiline constructs to use an explicit return.
        // This creates additional noise in the code, especially when
        // using constructs such as `pipe` or `Effect.gen`
        "arrow-return-style/arrow-return-style": "off",
      },
    },
  ]);
