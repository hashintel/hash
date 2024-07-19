// This configuration is here only as a stand-in until sheriff supports it, as flat configuration is currently only available in canary.
import { defineFlatConfig, type FlatESLintConfig } from "eslint-define-config";
import type { PartialDeep } from "type-fest";
import type { Options } from "./index.js";

// see: https://github.com/storybookjs/eslint-plugin-storybook/issues/160
// import eslintPluginStorybook from "eslint-plugin-storybook";

export const storybook =
  (options: PartialDeep<Options>) =>
    (config: FlatESLintConfig[]): FlatESLintConfig[] => {
      return config;

      // if (!options.enabled?.storybook) {
      //   return config;
      // }

      // return defineFlatConfig([
      //   ...config,
      //   ...eslintPluginStorybook.configs["flat/recommended"],
      //   {
      //     rules: {
      //       "storybook/no-uninstalled-addons": "error",
      //     },
      //   },
      //   {
      //     files: ["*.stories.{j,t}s{x,}"],
      //     rules: {
      //       "import/no-default-export": "off",
      //     },
      //   },
      // ]);
    };
