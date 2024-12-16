import { Array } from "effect";

import type { ESConfig } from "./utils.js";

export const jsdoc = (config: readonly ESConfig[]): readonly ESConfig[] =>
  Array.appendAll(config, [
    {
      rules: {
        "jsdoc/require-description": [
          "error",
          { exemptedBy: ["inheritdoc", "internal"] },
        ],
        // conflicts with tsdoc
        "jsdoc/check-tag-names": "off",
      },
    },
  ]);
