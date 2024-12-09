import { defineConfig, type ESConfig } from "./utils.js";

export const importPlugin = (
  config: readonly ESConfig[],
): readonly ESConfig[] =>
  defineConfig([
    ...config,
    {
      rules: {
        "import/order": [
          "error",
          {
            "newlines-between": "always",
            // This is the same as the default, but with `internal` added
            groups: [
              "builtin",
              "external",
              "internal",
              "parent",
              "sibling",
              "index",
            ],
          },
        ],
        // This clashes directly with file name endings as `./index.js` is required
        "import/no-useless-path-segments": ["error", { noUselessIndex: false }],
        // We no longer want to use CommonJS or AMD
        "import/no-commonjs": "error",
        "import/no-amd": "error",
        // We want to avoid circular dependencies
        "import/no-cycle": "error",
        // We have custom import/order rules that clash with `simple-import-sort`
        "simple-import-sort/imports": "off",
      },
    },
  ]);
