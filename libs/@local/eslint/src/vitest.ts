import type { PartialDeep } from "type-fest";
import { Array } from "effect";
import { testsFilePatterns } from "eslint-config-sheriff";

import type { ESConfig } from "./utils.js";

import type { Options } from "./index.js";

export const vitest =
  (options: PartialDeep<Options>) =>
  (config: readonly ESConfig[]): readonly ESConfig[] => {
    if (!options.enabled?.tests) {
      return config;
    }

    return Array.appendAll(config, [
      {
        files: [...testsFilePatterns],
        rules: {
          // this rule is too buggy
          "vitest/require-hook": "off",
          // in tests non-null assertions are fine
          "@typescript-eslint/no-non-null-assertion": "off",
        },
      },
    ]);
  };
