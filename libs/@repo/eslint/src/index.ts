import { defineFlatConfig } from "eslint-define-config";
import sheriff from "eslint-config-sheriff";

import type { FlatESLintConfig } from "eslint-define-config";
import { pipe, Predicate, ReadonlyArray, Option } from "effect";

// A subset of the allowed rule config, because we're sane
interface NoRestrictedImportsPath {
  name: string;
  message?: string;
  importNames?: string[];
}

interface NoRestrictedImportsPattern {
  importNames: [string, ...string[]];
  group: [string, ...string[]];
  importNamePattern?: string;
  message?: string;
  caseSensitive?: boolean;
}

interface NoRestrictedImportsRule {
  paths?: (NoRestrictedImportsPath | string)[];
  patterns?: NoRestrictedImportsPattern[];
}

export interface Options {
  enabled: {
    frontend: boolean;
    playwright: boolean;
    tests: boolean;
  };
  noRestrictedImports: () => NoRestrictedImportsRule[];
}

const noRestrictedImportsImpl =
  (overrides: () => NoRestrictedImportsRule[]) =>
  (config: FlatESLintConfig[]): FlatESLintConfig[] => {
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
    if (
      !Predicate.isRecord(current) ||
      Predicate.hasProperty(current, "name")
    ) {
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

    function apply(
      current: NoRestrictedImportsRule,
      override: NoRestrictedImportsRule,
    ): NoRestrictedImportsRule {
      return {
        paths: [...(current.paths ?? []), ...(override.paths ?? [])],
        patterns: [...(current.patterns ?? []), ...(override.patterns ?? [])],
      };
    }

    return defineFlatConfig([
      ...config,
      {
        rules: {
          "no-restricted-imports": [
            "error",
            overrides().reduce(apply, current as NoRestrictedImportsRule),
          ],
        },
      } satisfies FlatESLintConfig,
    ]);
  };

export function create(options: Options): FlatESLintConfig[] {
  const sheriffOptions = {
    react: false,
    next: options.enabled.frontend,
    lodash: true,
    playwright: options.enabled.playwright,
    jest: false,
    vitest: options.enabled.tests,
  };

  return pipe(
    sheriff(sheriffOptions),
    noRestrictedImportsImpl(options.noRestrictedImports),
    defineFlatConfig,
  );
}
