import { defineFlatConfig, type FlatESLintConfig } from "eslint-define-config";

export const importPlugin = (config: FlatESLintConfig[]): FlatESLintConfig[] =>
  defineFlatConfig([
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
      },
    },
  ]);
