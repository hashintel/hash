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
          // Personal preference, ensures that the code is more readable
          "react/jsx-boolean-value": "error",
          // Non-curly braces can lead to confusion and ambiguity
          // N.B. This is a quite subjective rule
          "react/jsx-curly-brace-presence": [
            "error",
            {
              props: "always",
              children: "never",
              // eslint-disable-next-line unicorn/prevent-abbreviations
              propElementValues: "always",
            },
          ],
        },
      },
    ]);
  };
