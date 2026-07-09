import { defineConfig, type ESConfig } from "./utils.js";

export const importPlugin = (
  config: readonly ESConfig[],
): readonly ESConfig[] =>
  defineConfig([
    ...config,
    {
      rules: {
        // Import ordering is handled by oxfmt
        "import/order": "off",
        "import/first": "off",
        // This clashes directly with file name endings as `./index.js` is required
        "import/no-useless-path-segments": ["error", { noUselessIndex: false }],
        // We no longer want to use CommonJS or AMD
        "import/no-commonjs": "error",
        "import/no-amd": "error",
        // We want to avoid circular dependencies
        "import/no-cycle": "error",
        // Import sorting is handled by oxfmt
        "simple-import-sort/imports": "off",
      },
    },
  ]);
