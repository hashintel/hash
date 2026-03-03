import { Array as ReadonlyArray, Option, pipe, Predicate } from "effect";
import type { PartialDeep } from "type-fest";

import type {
  NoRestrictedImportsRule,
  NormalizedNoRestrictedImportsRule,
  ValidNoRestrictedImportPatternOptions,
} from "./types.js";
import { defineConfig, type ESConfig } from "./utils.js";

import type { Options } from "./index.js";

const normalizeRestrictedImports = (
  rule: Partial<NoRestrictedImportsRule>,
): NormalizedNoRestrictedImportsRule => ({
  paths: rule.paths ?? [],
  // This mimics the behaviour of eslint: https://github.com/eslint/eslint/blob/4168a18b7efd8facbbd71cd44a62942a9f656a30/lib/rules/no-restricted-imports.js#L288-L294
  patterns: (rule.patterns &&
  rule.patterns.length > 0 &&
  typeof rule.patterns[0] === "string"
    ? [{ group: rule.patterns }]
    : rule.patterns) as ValidNoRestrictedImportPatternOptions[],
});

const mergeRestrictedImports = (
  current: NormalizedNoRestrictedImportsRule,
  override: Partial<NoRestrictedImportsRule>,
): NormalizedNoRestrictedImportsRule => {
  const overrideNormalized = normalizeRestrictedImports(override);

  return {
    paths: [...current.paths, ...overrideNormalized.paths],
    patterns: [...current.patterns, ...overrideNormalized.patterns],
  };
};

const noRestrictedImports = (
  config: readonly ESConfig[],
  overrides: () => NoRestrictedImportsRule[],
): readonly ESConfig[] => {
  // get the latest current `no-restricted-imports` rule value and merge with the
  // overrides
  const candidates = pipe(
    config,
    ReadonlyArray.map((entry) => entry.rules?.["no-restricted-imports"]),
    ReadonlyArray.filter(Predicate.isNotUndefined),
    ReadonlyArray.filterMap((entry) =>
      Array.isArray(entry) && entry.length === 2
        ? Option.some(entry[1])
        : Option.none(),
    ),
  );

  const current = candidates.at(-1);

  // the value should be a dictionary with `paths` and `patterns` keys
  if (!Predicate.isRecord(current) || Predicate.hasProperty(current, "name")) {
    throw new Error(
      "expected no-restricted-imports to follow the `paths` and `patterns` structure",
    );
  }

  if (current.patterns?.some((pattern) => typeof pattern === "string")) {
    throw new Error("expected patterns to be an array of objects");
  }

  const currentRule = {
    paths: current.paths ?? [],
    patterns: current.patterns ?? [],
  } as NormalizedNoRestrictedImportsRule;

  return defineConfig([
    {
      rules: {
        "no-restricted-imports": [
          "error",
          overrides().reduce(mergeRestrictedImports, currentRule),
        ],
      },
    } satisfies ESConfig,
  ]);
};

export const builtIn =
  (options: PartialDeep<Options>) =>
  (config: readonly ESConfig[]): readonly ESConfig[] =>
    defineConfig([
      ...config,
      {
        rules: {
          // Reason: Nesting ternary expressions can make code more difficult to understand.
          // While true they are a staple of JS and too integrated into our codebase to remove.
          // furthermore, `prettier` removes this concern by formatting them in a way that is easy to read.
          "no-nested-ternary": "off",
          // We always prefer arrow functions over function declarations.
          // Generators cannot be written as arrow functions, therefore are
          // allowed to be anonymous to accommodate effect.
          "func-names": ["error", "always", { generators: "never" }],
          // This is the same as sheriff's rule but allows for drafts to be modified
          "no-param-reassign": [
            "error",
            {
              props: true,
              ignorePropertyModificationsForRegex:
                options.mutableParametersRegex?.() ?? [],
            },
          ],
          // Clashes with `@typescript-eslint/no-floating-promises`
          "no-void": [
            "error",
            {
              allowAsStatement: true,
            },
          ],
          // Allow for classes
          "no-restricted-syntax/noClasses": "off",
          // exclude forEach from `array-callback-return`, as it only checks by name, not by type and clashes with effect.
          "array-callback-return": ["error", { allowImplicit: true }],
        },
      },
      ...noRestrictedImports(config, options.noRestrictedImports ?? (() => [])),
    ]);
