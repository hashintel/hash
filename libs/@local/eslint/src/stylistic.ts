import { defineConfig, ESConfig } from "./utils.js";

export const stylistic = (config: readonly ESConfig[]): readonly ESConfig[] =>
  defineConfig([
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
