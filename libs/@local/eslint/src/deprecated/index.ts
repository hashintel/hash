import { fixupConfigRules } from "@eslint/compat";
import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, ESConfig } from "../utils.js";
import { Array, pipe } from "effect";
// @ts-expect-error -- no types available
import reactHooksPlugin from "eslint-plugin-react-hooks";

const flatCompat = new FlatCompat();

export interface Options {}

// TODO: try again with a highly reduced set of rules from our base config
export const create = (options: Partial<Options>): readonly ESConfig[] => {
  return pipe(
    fixupConfigRules(flatCompat.extends("airbnb")),
    defineConfig,
    Array.append({
      plugins: {
        "react-hooks": reactHooksPlugin,
      },
    } satisfies ESConfig),
    Array.append({
      rules: {
        "canonical/filename-no-index": "error",
        "@typescript-eslint/consistent-type-imports": "error",
        // overridden airbnb rules (if you wish to add to this list, please outline your reasoning here: https://www.notion.so/hashintel/HASH-dev-eslint-configuration-60c52c127d13478fbce6bb5579a6b7be)
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
        "default-param-last": "off", // using @typescript-eslint/default-param-last instead
        "import/no-cycle": "error",
        "import/named": "off", // redundant for TypeScript code, leads to false positives with @blockprotocol/type-system
        "import/prefer-default-export": "off",
        "no-await-in-loop": "off",
        "no-console": "error",
        "no-dupe-class-members": "off",
        "import/no-unresolved": [
          2,
          {
            // graph uses 'exports' field in package.json https://github.com/import-js/eslint-plugin-import/issues/1810
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
        // because we are using typescript this is redundant
        "jsx-a11y/anchor-is-valid": "off",
        // because we use next.js empty anchor tags should be used when using the Link component
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
        // Other rule changes
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
                importNames: [],
                message: "Please import from @hashintel/design-system instead.",
              },
            ],
          },
        ],
        "react/require-default-props": "off",
        "no-shadow": "off",
        "@typescript-eslint/default-param-last": "error",
        // see https://github.com/typescript-eslint/typescript-eslint/issues/2483
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
        "import/extensions": [
          "error",
          "ignorePackages",
          {
            js: "never",
            jsx: "never",
            ts: "never",
            tsx: "never",
          },
        ],
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
              react: { named: true },
              "react-dom": { named: true },
            },
          },
        ],
        "unicorn/no-array-for-each": "error",
        "unicorn/prefer-node-protocol": "error",
      },
    } satisfies ESConfig),
    Array.append({
      settings: {
        "import/resolver": {
          node: {
            extensions: [".js", ".jsx", ".ts", ".tsx"],
          },
        },
      },
    } satisfies ESConfig),
  );
};
