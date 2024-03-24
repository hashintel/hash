import type { Linter } from "eslint";
import { Predicate } from "effect";
import { defineFlatConfig, type FlatESLintConfig } from "eslint-define-config";

import { JS_EXTENSIONS, JSX_EXTENSIONS } from "./index.js";

const namingConvention = ({ tsx }: { tsx: boolean }): Linter.RuleEntry => [
  "error",
  // adapted from https://github.com/AndreaPontrandolfo/sheriff/blob/3a6e3c9873c4b8fbbfbd01b6051c55fd1e57609a/packages/eslint-config-sheriff/src/getTsNamingConventionRule.ts#L9
  {
    selector: "default",
    format: ["camelCase", tsx && "StrictPascalCase"].filter(Predicate.isString),
    leadingUnderscore: "allow",
    trailingUnderscore: "forbid",
  },
  {
    selector: "variable",
    format: ["camelCase", "UPPER_CASE"],
    modifiers: ["const"],
    types: ["string", "number"],
    leadingUnderscore: "allow",
    trailingUnderscore: "forbid",
  },
  // allow constant variables in the global scope to be in UPPER_CASE,
  // but they cannot be unused.
  {
    selector: "variable",
    format: ["camelCase", "UPPER_CASE"],
    modifiers: ["const", "global"],
    leadingUnderscore: "forbid",
    trailingUnderscore: "forbid",
  },
  {
    selector: "objectLiteralProperty",
    format: null,
    leadingUnderscore: "allowSingleOrDouble",
    trailingUnderscore: "forbid",
  },
  {
    selector: "typeLike",
    format: ["PascalCase"],
    leadingUnderscore: "forbid",
    trailingUnderscore: "forbid",
  },
  // TODO: consider enabling this rule in the future:
  // https://typescript-eslint.io/rules/naming-convention/#enforce-that-boolean-variables-are-prefixed-with-an-allowed-verb
  {
    selector: "variable",
    modifiers: ["destructured"],
    format: null,
  },
  {
    selector: "typeProperty",
    format: null,
  },
  // forbid common type prefixes/suffixes
  {
    selector: "interface",
    format: ["PascalCase"],
    custom: {
      regex: "^I[A-Z]",
      match: false,
    },
  },
  {
    selector: "typeAlias",
    format: ["PascalCase"],
    custom: {
      regex: "^T[A-Z]",
      match: false,
    },
  },
  {
    selector: "enum",
    format: ["PascalCase"],
    custom: {
      regex: "^E[A-Z]",
      match: false,
    },
  },
];

export const typescript = (config: FlatESLintConfig[]): FlatESLintConfig[] =>
  defineFlatConfig([
    ...config,
    {
      rules: {
        // While a good idea, there are just too many places where this isn't the case yet
        // TODO: consider introducing this rule in the future
        "@typescript-eslint/explicit-module-boundary-types": "off",
        // Allow unused variables that start with an underscore (goes hand in hand with
        // the naming convention)
        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            args: "all",
            argsIgnorePattern: "^_",
            caughtErrors: "all",
            caughtErrorsIgnorePattern: "^_",
            destructuredArrayIgnorePattern: "^_",
            // eslint-disable-next-line unicorn/prevent-abbreviations
            varsIgnorePattern: "^_",
            ignoreRestSiblings: true,
          },
        ],
      },
    },
    {
      files: [`**/*{${JS_EXTENSIONS}}`],
      rules: {
        "@typescript-eslint/naming-convention": namingConvention({
          tsx: false,
        }),
      },
    },
    {
      files: [`**/*{${JSX_EXTENSIONS}}`],
      rules: {
        "@typescript-eslint/naming-convention": namingConvention({
          tsx: true,
        }),
      },
    },
  ]);
