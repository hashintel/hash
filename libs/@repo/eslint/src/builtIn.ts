import { defineFlatConfig, type FlatESLintConfig } from "eslint-define-config";
import { Option, pipe, Predicate, ReadonlyArray } from "effect";

import type { NoRestrictedImportsRule, Options } from "./index.js";

const mergeRestrictedImports = (
  current: NoRestrictedImportsRule,
  override: NoRestrictedImportsRule,
): NoRestrictedImportsRule => ({
  paths: [...(current.paths ?? []), ...(override.paths ?? [])],
  patterns: [...(current.patterns ?? []), ...(override.patterns ?? [])],
});

const noRestrictedImports = (
  config: FlatESLintConfig[],
  overrides: () => NoRestrictedImportsRule[],
): FlatESLintConfig[] => {
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

  if (
    current.patterns !== undefined &&
    current.patterns.some((pattern) => typeof pattern === "string")
  ) {
    throw new Error("expected patterns to be an array of objects");
  }

  const currentRule = current as NoRestrictedImportsRule;

  return defineFlatConfig([
    {
      rules: {
        "no-restricted-imports": [
          "error",
          overrides().reduce(mergeRestrictedImports, currentRule),
        ],
      },
    } satisfies FlatESLintConfig,
  ]);
};

export const builtIn =
  (options: Options) =>
  (config: FlatESLintConfig[]): FlatESLintConfig[] =>
    defineFlatConfig([
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
          "func-names": ["error", "always", { generators: "as-needed" }],
        },
      },
      ...noRestrictedImports(config, options.noRestrictedImports ?? (() => [])),
    ]);
