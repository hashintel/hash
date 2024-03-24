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
          // typescript ensures that spread props are of the correct type
          "react/jsx-props-no-spreading": "off",
          // Personal preference
          "react/no-multi-comp": "off",
          // Non-curly braces can lead to confusion and ambiguity
          "react/jsx-curly-brace-presence": ["error", "always"],
        },
      },
    ]);
  };
