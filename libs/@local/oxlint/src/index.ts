import { URL, fileURLToPath } from "node:url";

import { strict as effectStrict } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "oxlint";

import plugin from "./rules/index.js";

import type { AllowWarnDeny, DummyRuleMap, OxlintConfig } from "oxlint";

export { defineConfig } from "oxlint";
export type Framework = "react" | "next" | "vitest" | "effect";
export type Runtime = "node" | "browser";

type RestrictedTypeRule = NonNullable<
  NonNullable<OxlintConfig["rules"]>["typescript/no-restricted-types"]
>;
type RestrictedTypes = NonNullable<
  Exclude<RestrictedTypeRule, AllowWarnDeny | [AllowWarnDeny]>[1]["types"]
>;

const defaultRestrictedTypes = {
  object:
    "Prefer a domain type or a useful generic relationship, or justify this broad contract.",
  unknown: "Preserve known type information, or justify this unknown boundary.",
  Function: "Prefer a named function over an anonymous function.",
} satisfies RestrictedTypes;

type AdditionalRestrictedTypes = Readonly<RestrictedTypes> & {
  readonly [TypeName in keyof typeof defaultRestrictedTypes]?: never;
};

export interface Options {
  readonly runtime: Runtime;

  /** Adds restrictions without replacing built-in entries. Duplicate keys throw. */
  readonly additionalRestrictedTypes?: AdditionalRestrictedTypes;
  readonly frameworks?: readonly Framework[];
  readonly ignorePatterns?: readonly string[];
}

type Overrides = NonNullable<OxlintConfig["overrides"]>;
type LintPlugins = NonNullable<OxlintConfig["plugins"]>;

type Env = NonNullable<OxlintConfig["env"]>;

type Extends = NonNullable<OxlintConfig["extends"]>;

const defineRules = (rules: DummyRuleMap): DummyRuleMap => rules;
const defineOverride = (override: Overrides[number]): Overrides[number] =>
  override;

// oxlint-disable-next-line max-lines-per-function -- no logic, only configuration
export const createConfig = (options: Options): OxlintConfig => {
  const additionalRestrictedTypes = options.additionalRestrictedTypes ?? {};
  for (const typeName of Object.keys(defaultRestrictedTypes)) {
    if (Object.hasOwn(additionalRestrictedTypes, typeName)) {
      throw new Error(
        `Cannot override the built-in restriction for "${typeName}".`,
      );
    }
  }

  const plugins: LintPlugins = [
    "eslint",
    "typescript",
    "import",
    "unicorn",
    "oxc",
    "jsdoc",
    "promise",
  ];
  const extend: Extends = [];
  const env: Env = { builtin: true, es2026: true };
  const rules: DummyRuleMap = {};
  const overrides: Overrides = [
    {
      files: ["**/*.config.ts"],
      rules: {
        "import/no-default-export": "off", // config files always use `defineConfig` with a default export
      },
    },
  ];

  switch (options.runtime) {
    case "node": {
      env["node"] = true;
      break;
    }
    case "browser": {
      env["browser"] = true;
      break;
    }
  }

  for (const framework of options.frameworks ?? []) {
    switch (framework) {
      case "react": {
        plugins.push("react", "react-perf", "jsx-a11y");
        break;
      }
      case "next": {
        plugins.push("nextjs", "react-perf", "jsx-a11y");
        break;
      }
      case "vitest": {
        plugins.push("vitest");
        Object.assign(
          rules,
          defineRules({
            "vitest/consistent-test-it": ["deny", { withinDescribe: "test" }], // Use the same declaration name inside and outside describe blocks.
            "vitest/no-importing-vitest-globals": "off", // import Vitest APIs instead of relying on globals
            "vitest/no-restricted-vi-methods": [
              "deny", // Module mocks hide dependencies. Method spies remain available.
              {
                doMock: "Inject dependencies instead of replacing modules.",
                mock: "Inject dependencies instead of replacing modules.",
              },
            ],
            "vitest/require-test-timeout": "off", // the default timeout is a good default for most tests
            "vitest/prefer-describe-function-title": "off", // clashes with valid-title
            "vitest/prefer-to-be-falsy": "off", // Strict boolean matchers distinguish false from falsy values.
            "vitest/prefer-to-be-truthy": "off", // Strict boolean matchers distinguish true from truthy values.
          }),
        );
        overrides.push(
          defineOverride({
            files: ["src/**/*.test-d.ts"],
            rules: {
              "vitest/prefer-expect-assertions": "off", // type tests run through the compiler, not the runtime assertion counter.
              "no-magic-numbers": "off", // magic numbers are often used in test fixtures
              "max-lines-per-function": "off", // tests are allowed to have more statements, because `describe` blocks are often used to group related tests
            },
          }),
          defineOverride({
            files: ["src/**/*.test.ts"],
            rules: {
              "no-magic-numbers": "off", // magic numbers are often used in test fixtures
              "max-lines-per-function": "off", // tests are allowed to have more statements, because `describe` blocks are often used to group related tests
            },
          }),
        );

        break;
      }
      case "effect": {
        extend.push(effectStrict);
        Object.assign(
          rules,
          defineRules({
            "new-cap": "off", // clashes with effect's capitalization conventions
            "oxc/no-barrel-file": "off", // side-effect free barrel files are common
            "import/no-namespace": "off", // barrel files are common in effect
            "no-underscore-dangle": ["deny", { allow: ["_tag"] }], // `_tag` is used to discriminate union types
            "unicorn/max-nested-calls": "off", // functional programming and composition
            "typescript/no-namespace": ["deny", { allowDeclarations: true }], // declarations are often used for type aliases
            "no-shadow": "off", // covered by the strict typescript setup
            "no-redeclare": "off", // covered by the strict typescript setup
            "effecttsgo/missed-pipeable-opportunity": "deny", // nested function calls otherwise aren't readable
          }),
        );
        break;
      }
    }
  }

  const pluginDeny = Object.fromEntries(
    Object.keys(plugin.rules).map((key) => [
      `${plugin.meta?.name ?? "hash"}/${key}`,
      "deny",
    ]),
  );

  return defineConfig({
    categories: {
      correctness: "deny",
      nursery: "deny",
      pedantic: "deny",
      perf: "deny",
      restriction: "deny",
      style: "deny",
      suspicious: "deny",
    },
    env,
    extends: extend,
    ignorePatterns: [...(options.ignorePatterns ?? [])],
    jsPlugins: [
      {
        name: "hash",
        specifier: fileURLToPath(new URL("rules/index.js", import.meta.url)),
      },
    ],
    options: {
      reportUnusedDisableDirectives: "error",
      typeAware: true,
    },
    overrides,
    plugins,
    rules: {
      "capitalized-comments": "off", // a linter should not police the style of comments
      "default-case": "off", // type checking establishes the exhaustive set of cases
      "import/exports-last": "off", // hurts readability, as items are commonly exported at declaration
      "import/group-exports": "off", // hurts readability
      "import/no-named-export": "off", // prefer named exports
      "import/no-nodejs-modules": "off", // TypeScript 7 handles this natively through removal of ambient type definitions
      "import/no-relative-parent-imports": "off", // relative parent imports are the de-factor standard for importing from parent directories
      "import/prefer-default-export": "off", // depends on the module
      "jsdoc/require-param": "off", // TypeScript supplies parameter types
      "jsdoc/require-returns": "off", // TypeScript supplies return types
      "max-lines": [
        "deny", // Keep each module reviewable as one unit, including its documentation.
        {
          max: 500,
          skipBlankLines: false,
          skipComments: false,
        },
      ],
      "max-lines-per-function": [
        "deny", // Bound executable bodies without charging comments against their budget.
        {
          IIFEs: true,
          max: 100,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "max-statements": "off", // "max-lines-per-function" is a better proxy
      "no-duplicate-imports": [
        "error", // Keep type-only dependencies distinct from runtime imports.
        {
          allowSeparateTypeImports: true,
        },
      ],
      "no-inline-comments": "off", // inline comments are useful for explaining complex logic
      "no-magic-numbers": [
        "deny", // Keep the rule narrow with the exceptions below.
        {
          enforceConst: true,
          ignore: [-2, -1, 0, 1, 2],
          ignoreClassFieldInitialValues: true,
          ignoreDefaultValues: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
        },
      ],
      "no-undefined": "off", // comparisons need `undefined`
      "one-var": ["deny", "never"], // use one declaration per variable
      "oxc/no-optional-chaining": "off", // optional chaining is useful for optional properties
      "oxc/no-rest-spread-properties": "off", // central to functional programming
      "prefer-destructuring": "off", // requiring destructuring for reassignment makes the code awkward
      "sort-imports": [
        "deny", // Sort members while preserving dependency groups and declaration order.
        {
          allowSeparatedGroups: true,
          ignoreDeclarationSort: true,
        },
      ],
      "sort-keys": "off", // declaration order is more important, and fix may be unsafe, sorting of keys does not increase clarity
      "typescript/no-floating-promises": [
        "deny", // Discarded async failures must not disappear behind void or an IIFE.
        {
          checkThenables: true,
          ignoreIIFE: false,
          ignoreVoid: false,
        },
      ],
      "typescript/no-restricted-types": [
        "deny", // Broad types erase contracts that callers need to check their use.
        { types: { ...defaultRestrictedTypes, ...additionalRestrictedTypes } },
      ],
      "typescript/restrict-plus-operands": [
        "deny", // Addition must not depend on implicit coercion.
        {
          allowAny: false,
          allowBoolean: false,
          allowNullish: false,
          allowNumberAndString: false,
          allowRegExp: false,
        },
      ],
      "typescript/restrict-template-expressions": [
        "deny", // Make object and nullable interpolation explicit to avoid accidental placeholder text.
        {
          allowAny: false,
          allowBoolean: false,
          allowNever: false,
          allowNullish: false,
          allowNumber: true,
          allowRegExp: false,
        },
      ],
      "typescript/strict-boolean-expressions": [
        "deny", // Truthiness hides distinctions between absence, zero and empty strings.
        {
          allowNullableObject: false,
          allowNumber: false,
          allowString: false,
        },
      ],
      "unicorn/no-null": "off", // `null` is a useful type to indicate explicit absence of a value
      "func-names": ["deny", "always", { generators: "never" }], // Name functions for stack traces without naming generator callbacks.
      "typescript/no-empty-interface": ["deny", { allowSingleExtends: true }], // Permit named interfaces for readable editor type hints.
      "typescript/no-empty-object-type": [
        "deny", // Permit named interfaces for readable editor type hints.
        { allowInterfaces: "with-single-extends" },
      ],
      "typescript/prefer-readonly-parameter-types": "off", // neat idea, but way too many false positives
      "unicorn/prefer-ternary": "off", // clashes with the rule that requires explicit if/else
      "id-length": ["deny", { checkGeneric: false, exceptions: ["$", "_"] }], // Type parameters and conventional helper bindings need their short names.
      "unicorn/no-array-callback-reference": "off", // goes against functional programming
      "typescript/explicit-member-accessibility": "off", // goes against modern ts and js interop
      ...rules,
      ...pluginDeny,
    },
  });
};
