import path from "node:path";
import { fileURLToPath } from "node:url";

import getGitignorePatterns from "eslint-config-flat-gitignore";
// @ts-expect-error - eslint-plugin-import does not expose types
import importPlugin from "eslint-plugin-import";
import { ignores } from "eslint-config-sheriff";
import canonical from "eslint-plugin-canonical";
// @ts-expect-error - react-hooks does not expose types
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";
import { fixupPluginRules } from "@eslint/compat";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import { Array, pipe, Record, Struct } from "effect";

import { projectIgnoreFiles, type ESConfig } from "../utils.js";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const compat = new FlatCompat({
  baseDirectory: dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const removeImportPlugin = (
  configs: readonly ESConfig[],
): readonly ESConfig[] =>
  pipe(
    configs,
    Array.map(
      Struct.evolve({
        plugins: (plugins) =>
          plugins === undefined ? undefined : Record.remove(plugins, "import"),
      }),
    ),
  );

export const create = (projectDirectory: string) =>
  [
    ...removeImportPlugin(compat.extends("airbnb", "prettier")),
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          // eslint-disable-next-line unicorn/prevent-abbreviations
          tsconfigRootDir: projectDirectory,
        },
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    importPlugin.flatConfigs.recommended,
    {
      plugins: {
        "@typescript-eslint": typescriptEslint,
        canonical,
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-argument */
        "react-hooks": fixupPluginRules(reactHooks),
        "simple-import-sort": simpleImportSort,
        unicorn,
      },

      linterOptions: {
        reportUnusedDisableDirectives: true,
      },

      languageOptions: {
        globals: {
          ...globals.browser,
          ...globals.node,
          NodeJS: true,
          FixMeLater: "readonly",
          globalThis: "readonly",
        },

        parser: tsParser,

        ecmaVersion: "latest",
        sourceType: "module",
      },

      settings: {
        "import/resolver": {
          typescript: {
            alwaysTryTypes: true,
            project: projectDirectory,
            extensions: [".js", ".jsx", ".ts", ".tsx"],
          },
        },
      },

      rules: {
        "canonical/filename-no-index": "error",
        "@typescript-eslint/consistent-type-imports": "error",
        "no-undef-init": "off",
        "no-underscore-dangle": "off",
        "no-nested-ternary": "off",

        "no-restricted-syntax": [
          "error",
          {
            selector:
              "TSTypeReference[typeName.name=/^(Plugin|PluginKey)$/]:not([typeParameters])",
            message: "Please provide a generic to avoid implicit `any`",
          },
          {
            selector:
              "TSTypeReference[typeName.name=/^(Plugin|PluginKey)$/][typeParameters.params.0.type=TSAnyKeyword]",
            message: "Please replace `any` with a specific type",
          },
          {
            selector:
              "NewExpression[callee.name=/^(Plugin|PluginKey)$/]:not([typeParameters])",
            message: "Please provide a generic to avoid implicit `any`",
          },
          {
            selector:
              "NewExpression[callee.name=/^(Plugin|PluginKey)$/][typeParameters.params.0.type=TSAnyKeyword]",
            message: "Please replace `any` with a specific type",
          },
        ],

        camelcase: "off",
        "default-param-last": "off",
        "import/no-cycle": "error",
        "import/named": "off",
        "import/prefer-default-export": "off",
        "no-await-in-loop": "off",
        "no-console": "error",
        "no-dupe-class-members": "off",

        "import/no-unresolved": [
          2,
          {
            ignore: [
              "^@apps/",
              "^@blockprotocol/graph",
              "^@blockprotocol/hook",
              "^@blockprotocol/service",
              "^@blockprotocol/type-system",
              "^@hashintel/",
              "^@local/",
            ],
          },
        ],

        "react/prop-types": "off",
        "jsx-a11y/anchor-is-valid": "off",

        "react/jsx-filename-extension": [
          2,
          {
            extensions: [".js", ".jsx", ".ts", ".tsx"],
          },
        ],

        "react/jsx-props-no-spreading": "off",

        "no-void": [
          "error",
          {
            allowAsStatement: true,
          },
        ],

        "no-continue": "off",
        "react/react-in-jsx-scope": "off",
        "no-return-await": "off",
        "max-classes-per-file": "off",

        "lines-between-class-members": [
          "error",
          "always",
          {
            exceptAfterSingleLine: true,
          },
        ],

        "consistent-return": "off",
        "default-case": "off",
        "class-methods-use-this": "off",
        "react/no-unescapted-entities": "off",
        "jsx-a11y/no-autofocus": "off",
        "no-plusplus": "off",
        "prefer-destructuring": "off",
        "no-else-return": "off",
        "arrow-body-style": "off",
        "react/no-unescaped-entities": "off",
        "react-hooks/rules-of-hooks": "error",

        "react-hooks/exhaustive-deps": [
          "error",
          {
            additionalHooks: "^(useModal|useUserGatedEffect)$",
          },
        ],

        "react/function-component-definition": [
          "error",
          {
            namedComponents: "arrow-function",
            unnamedComponents: "arrow-function",
          },
        ],

        "react/jsx-key": "error",
        "react/jsx-no-useless-fragment": "error",
        "react/self-closing-comp": "error",

        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "react",
                importNames: ["FC", "VFC", "VoidFunctionComponent"],
                message: "Please use FunctionComponent instead",
              },
              {
                name: "@testing-library/react",
                importNames: ["render"],
                message: "Please use ./src/tests/testUtils.tsx#render instead",
              },
              {
                name: "@mui/material",
                importNames: ["Link"],
                message:
                  /* eslint-disable-next-line sonarjs/no-duplicate-string */
                  "Please use the custom src/components/Link component instead to ensure Next.js and MUI compatibility.",
              },
              {
                name: "@mui/material/Link",
                message:
                  "Please use the custom src/components/Link component instead to ensure Next.js and MUI compatibility.",
              },
              {
                name: "next",
                importNames: ["Link"],
                message:
                  "Please use the custom src/components/Link component instead to ensure Next.js and MUI compatibility.",
              },
              {
                name: "next/link",
                message:
                  "Please use the custom src/components/Link component instead to ensure Next.js and MUI compatibility.",
              },
              {
                name: "@mui/material",
                importNames: ["Button"],
                message:
                  "Please use the custom wrapper component in src/component instead.",
              },
              {
                name: "@mui/material/Button",
                importNames: ["default"],
                message:
                  "Please use the custom src/components/Button component instead.",
              },
            ],

            patterns: [
              {
                group: [
                  "@hashintel/design-system/*",
                  "!@hashintel/design-system/theme",
                  "!@hashintel/design-system/constants",
                  "!@hashintel/design-system/palettes",
                ],

                message: "Please import from @hashintel/design-system instead.",
              },
            ],
          },
        ],

        "react/require-default-props": "off",
        "no-shadow": "off",
        "@typescript-eslint/default-param-last": "error",
        "@typescript-eslint/no-shadow": "error",
        "no-use-before-define": "off",
        "@typescript-eslint/no-use-before-define": ["error"],
        "no-redeclare": "off",
        "@typescript-eslint/no-redeclare": ["error"],

        eqeqeq: [
          "error",
          "always",
          {
            null: "ignore",
          },
        ],

        "id-length": [
          "error",
          {
            min: 2,
            exceptions: ["_", "x", "y", "z", "a", "b", "i"],
            properties: "never",
          },
        ],

        "no-unused-expressions": "error",
        curly: ["error", "all"],

        // needs to be disabled because it can't map `.js` -> `.ts` correctly
        // see: https://github.com/import-js/eslint-plugin-import/issues/2776
        "import/extensions": "off",

        "no-useless-constructor": "off",
        "@typescript-eslint/no-useless-constructor": ["error"],

        "@typescript-eslint/ban-ts-comment": [
          "error",
          {
            "ts-expect-error": "allow-with-description",
            minimumDescriptionLength: 10,
          },
        ],

        "no-empty-function": "off",

        "no-param-reassign": [
          "error",
          {
            props: true,
            ignorePropertyModificationsForRegex: ["^draft"],

            ignorePropertyModificationsFor: [
              "acc",
              "accumulator",
              "e",
              "ctx",
              "context",
              "req",
              "request",
              "res",
              "response",
              "$scope",
              "staticContext",
            ],
          },
        ],

        "simple-import-sort/exports": "error",
        "simple-import-sort/imports": "error",
        "unicorn/filename-case": "error",

        "unicorn/import-style": [
          "error",
          {
            styles: {
              react: {
                named: true,
              },

              "react-dom": {
                named: true,
              },
            },
          },
        ],

        "unicorn/no-array-for-each": "error",
        "unicorn/prefer-node-protocol": "error",
      },
    },
    {
      files: ["**/*.cjs"],

      languageOptions: {
        ecmaVersion: 5,
        sourceType: "script",

        parserOptions: {
          requireConfigFile: false,
          extraFileExtensions: [".cjs"],
        },
      },
    },
    {
      files: [
        "**/tests/**",
        "**/__mocks__/**",
        "**/testUtils/**",
        "**/*.test.{j,t}s{x,}",
      ],

      languageOptions: {
        globals: {
          ...globals.node,
        },
      },

      rules: {
        "import/no-extraneous-dependencies": [
          "error",
          {
            devDependencies: true,
          },
        ],
      },
    },
    {
      files: [".storybook/*", "**/*.stories.{j,t}s{x,}"],

      rules: {
        "import/no-extraneous-dependencies": [
          "error",
          {
            devDependencies: true,
          },
        ],
      },
    },
    {
      files: ["**/*.config.{c,m,}{j,t}s", "**/*.d.ts", "**/*rc.{c,m,}js"],

      rules: {
        "global-require": "off",

        "import/no-extraneous-dependencies": [
          "error",
          {
            devDependencies: true,
          },
        ],
      },
    },
    ...compat
      .extends("plugin:@typescript-eslint/recommended-requiring-type-checking")
      .map((config) => ({
        ...config,
        files: ["**/*.ts", "**/*.tsx"],
      })),
    {
      files: ["**/*.ts", "**/*.tsx"],

      rules: {
        "no-unused-vars": "off",

        "@typescript-eslint/prefer-nullish-coalescing": [
          "error",
          {
            ignoreMixedLogicalExpressions: true,
          },
        ],

        "@typescript-eslint/no-meaningless-void-operator": "error",

        "@typescript-eslint/no-misused-promises": [
          "error",
          {
            checksVoidReturn: {
              attributes: false,
              properties: false,
            },
          },
        ],

        "no-constant-condition": "off",
        "@typescript-eslint/no-unnecessary-condition": "error",

        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            args: "all",
            argsIgnorePattern: "^_+",
            /* eslint-disable-next-line unicorn/prevent-abbreviations */
            varsIgnorePattern: "^_+",
          },
        ],
      },
    },
    {
      files: ["**/scripts/**"],

      rules: {
        "no-console": "off",
      },
    },
    getGitignorePatterns({
      strict: false,
      files: projectIgnoreFiles(projectDirectory),
    }),
    {
      ignores,
    },
  ] as readonly ESConfig[];
