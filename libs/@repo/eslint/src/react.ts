import { defineFlatConfig, type FlatESLintConfig } from "eslint-define-config";

import type { Options } from "./index.js";

export const react =
  (options: Options) =>
  (config: FlatESLintConfig[]): FlatESLintConfig[] => {
    if (!options.enabled.frontend) {
      return config;
    }

    return defineFlatConfig([
      ...config,
      {
        rules: {
          // disallows the use of `dangerouslySetInnerHTML`
          "react/no-danger": "error",
          // We make use of quite a few HOCs
          // Typescript ensures that the props are passed correctly
          // TODO: investigate if we want to enable this in the future
          "react/jsx-props-no-spreading": "off",
          // Personal preference
          "react/no-multi-comp": "off",
          // Non-curly braces can lead to confusion and ambiguity
          "react/jsx-curly-brace-presence": ["error", "always"],
        },
      },
    ]);
  };
