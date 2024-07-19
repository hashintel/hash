import { create, defineFlatConfig } from "@local/eslint";

export default defineFlatConfig([
  ...create({
    enabled: {
      frontend: false,
      playwright: false,
      tests: true,
    },
    noRestrictedImports: () => [
      {
        files: ["./src/**/*.ts"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  group: ["@local/hash-backend-utils/*"],
                  message:
                    "This package is shared by FE and BE, move backend utils here if both need them.",
                },
              ],
            },
          ],
        },
      },
      {
        files: ["src/system-types/**"],
        rules: {
          "@typescript-eslint/ban-types": [
            "error",
            {
              types: {
                /**
                 * @todo update the codegen utility in @blockprotocol/graph to generate Object as Record<string, unknown>, not {}
                 */
                "{}": false,
              },
              extendDefaults: true,
            },
          ],
        },
      },
    ],
  }),
  {
    rules: {
      "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
    },
  },
]);
