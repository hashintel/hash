/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  plugins: ["file-extension-in-import-ts"],
  rules: {
    ...require("@local/eslint-config/temporarily-disable-rules.cjs")([
      /* 2022-11-29:   6 */ "@typescript-eslint/no-unsafe-argument",
      /* 2022-11-29:  15 */ "@typescript-eslint/no-unsafe-assignment",
      /* 2022-11-29:   5 */ "@typescript-eslint/no-unsafe-call",
      /* 2022-11-29:   7 */ "@typescript-eslint/no-unsafe-member-access",
      /* 2022-11-29:   7 */ "@typescript-eslint/no-unsafe-return",
    ]),
    "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
    "file-extension-in-import-ts/file-extension-in-import-ts": "error",
  },
  overrides: [
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
};
