import type { Profile } from "./profile.js";
import type { AllowWarnDeny, OxlintConfig } from "oxlint";

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

export type AdditionalRestrictedTypes = Readonly<RestrictedTypes> & {
  readonly [TypeName in keyof typeof defaultRestrictedTypes]?: never;
};

interface BaseOptions {
  readonly additionalRestrictedTypes: AdditionalRestrictedTypes;

  /** Every JSDoc tag beyond the standard ones that `jsdoc/check-tag-names` accepts. */
  readonly definedJsDocTags: readonly string[];
}

/**
 * Creates the profile every configuration starts from.
 *
 * @throws {Error} If `additionalRestrictedTypes` replaces a built-in restricted type.
 */
// oxlint-disable-next-line max-lines-per-function -- no logic, only configuration
export const base = ({
  additionalRestrictedTypes,
  definedJsDocTags,
}: BaseOptions): Profile => {
  for (const typeName of Object.keys(defaultRestrictedTypes)) {
    if (Object.hasOwn(additionalRestrictedTypes, typeName)) {
      throw new Error(
        `Cannot override the built-in restriction for "${typeName}".`,
      );
    }
  }

  return {
    plugins: [
      "eslint",
      "typescript",
      "import",
      "unicorn",
      "oxc",
      "jsdoc",
      "promise",
    ],
    overrides: [
      {
        files: ["**/*.{ts,tsx,mts,cts}"],
        rules: {
          "jsdoc/require-param-type": "allow", // TypeScript signatures supply parameter types.
          "jsdoc/require-returns-type": "allow", // TypeScript signatures supply return types.
        },
      },
      {
        files: ["**/*.config.{js,ts,mjs,mts}"],
        env: { browser: false, node: true },
        rules: {
          "import/no-default-export": "allow", // config files always use `defineConfig` with a default export
        },
      },
    ],
    rules: {
      "capitalized-comments": "allow", // a linter should not police the style of comments
      "default-case": "allow", // type checking establishes the exhaustive set of cases
      "import/exports-last": "allow", // hurts readability, as items are commonly exported at declaration
      "import/group-exports": "allow", // hurts readability
      "import/no-named-export": "allow", // prefer named exports
      "import/no-nodejs-modules": "allow", // TypeScript 7 handles this natively through removal of ambient type definitions
      "import/no-relative-parent-imports": "allow", // relative parent imports are the de-factor standard for importing from parent directories
      "import/prefer-default-export": "allow", // depends on the module
      "jsdoc/require-param": "allow", // TypeScript supplies parameter types
      "jsdoc/require-returns": "allow", // TypeScript supplies return types
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
      "max-statements": "allow", // "max-lines-per-function" is a better proxy
      "no-duplicate-imports": [
        "deny", // Keep type-only dependencies distinct from runtime imports.
        {
          allowSeparateTypeImports: true,
        },
      ],
      "no-inline-comments": "allow", // inline comments are useful for explaining complex logic
      "no-magic-numbers": "allow", // hash/no-magic-numbers also accepts arithmetic over literals, such as `60 * 60 * 24`.
      "no-ternary": "allow", // hash/no-complex-ternary restricts branch expressions without banning simple value selection.
      "no-undefined": "allow", // comparisons need `undefined`
      "no-warning-comments": [
        "deny", // exclude TODO, as we use TODO(NN-XXX): [...]
        { terms: ["fixme", "xxx"] },
      ],
      "one-var": ["deny", "never"], // use one declaration per variable
      "oxc/no-async-await": "allow", // Promise-based code uses native async functions.
      "oxc/no-optional-chaining": "allow", // optional chaining is useful for optional properties
      "oxc/no-rest-spread-properties": "allow", // central to functional programming
      "prefer-destructuring": "allow", // requiring destructuring for reassignment makes the code awkward
      "eslint/require-await": "allow", // The TypeScript rule recognizes returned promises without an await expression.
      "sort-imports": [
        "deny", // Sort members while preserving dependency groups and declaration order.
        {
          allowSeparatedGroups: true,
          ignoreDeclarationSort: true,
        },
      ],
      "sort-keys": "allow", // declaration order is more important, and fix may be unsafe, sorting of keys does not increase clarity
      "typescript/consistent-return": "allow", // TypeScript’s noImplicitReturns checks return paths through control-flow analysis.
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
      "unicorn/no-negated-condition": "allow", // ESLint checks the same condition forms without duplicate diagnostics.
      "unicorn/no-nested-ternary": "allow", // ESLint forbids all nested ternaries, including parenthesized ones.
      "unicorn/no-null": "allow", // `null` is a useful type to indicate explicit absence of a value
      "unicorn/number-literal-case": "allow", // oxfmt owns numeric-literal formatting
      "func-names": ["deny", "always", { generators: "never" }], // Name functions for stack traces without naming generator callbacks.
      "typescript/no-empty-interface": ["deny", { allowSingleExtends: true }], // Permit named interfaces for readable editor type hints.
      "typescript/no-empty-object-type": [
        "deny", // Permit named interfaces for readable editor type hints.
        { allowInterfaces: "with-single-extends" },
      ],
      "typescript/prefer-readonly-parameter-types": "allow", // neat idea, but way too many false positives
      "unicorn/prefer-ternary": "allow", // clashes with the rule that requires explicit if/else
      "id-length": ["deny", { checkGeneric: false, exceptions: ["$", "_"] }], // Type parameters and conventional helper bindings need their short names.
      "unicorn/no-array-callback-reference": "allow", // goes against functional programming
      "typescript/explicit-member-accessibility": "allow", // goes against modern ts and js interop
      "jsdoc/check-tag-names": [
        "deny", // deny is the default, but we want to allow additional tags
        { definedTags: [...definedJsDocTags] },
      ],
    },
  };
};
