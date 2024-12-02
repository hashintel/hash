// This configuration is here only as a stand-in until sheriff supports it, as flat configuration is currently only available in canary.
import type { PartialDeep } from "type-fest";
import type { Options } from "./index.js";

import eslintPluginStorybook from "eslint-plugin-storybook";
import { defineConfig, ESConfig } from "./utils.js";

export const storybook =
  (options: PartialDeep<Options>) =>
  (config: readonly ESConfig[]): readonly ESConfig[] => {
    if (!options.enabled?.storybook) {
      return config;
    }

    return defineConfig([
      ...config,
      ...(eslintPluginStorybook.configs[
        "flat/recommended"
      ] as unknown as readonly ESConfig[]),
      {
        rules: {
          "storybook/no-uninstalled-addons": "error",
        },
      },
      {
        files: ["*.stories.{j,t}s{x,}"],
        rules: {
          "import/no-default-export": "off",
        },
      },
    ]);
  };
