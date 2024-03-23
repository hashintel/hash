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

const noRestrictedImports =
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

const preventAbbreviations =
  () =>
  (config: FlatESLintConfig[]): FlatESLintConfig[] =>
    defineFlatConfig([
      ...config,
      {
        rules: {
          "unicorn/prevent-abbreviations": [
            "error",
            {
              checkFilenames: true,
              checkProperties: true,
              checkDefaultAndNamespaceImports: true,
              checkShorthandImports: "internal",
              extendDefaultReplacements: true,
              replacement: {
                // Offensive terms
                whitelist: {
                  include: true,
                  allowList: true,
                  permitList: true,
                  passList: true,
                },
                blacklist: {
                  exclude: true,
                  denyList: true,
                  blockList: true,
                  rejectList: true,
                },
                master: {
                  primary: true,
                  host: true,
                  leader: true,
                  main: true,
                  trunk: true,
                },
                slave: {
                  secondary: true,
                  guest: true,
                  follower: true,
                  replica: true,
                  branch: true,
                },

                // Gendered terms
                man: {
                  person: true,
                  human: true,
                  individual: true,
                  being: true,
                  user: true,
                },

                // Reverse (some abbreviations are very well understood)
                application: {
                  app: true,
                },
                applications: {
                  apps: true,
                },

                // Disable some default replacements that are well understood
                // and commonly used (or from other languages)
                env: false,
                impl: false, // <- `rust`
                iter: false, // <- `rust`
                temp: false,
                tmp: {
                  temp: true,
                },
                gen: false, // <- `rust` + `effect`
                ctx: false, // <- `rust` + `effect`
                dev: false,
                prod: false,
                fn: false,
                func: {
                  fn: true, // mimic `rust`
                },
                ref: false, // <- `rust` + `effect`
                refs: false, // <- `rust` + `effect`
                arg: false,
                args: false,
                param: false,
                params: false,
                docs: false,
                db: false,

                // Not part of `eslint-plugin-unicorn`, copied from `xo`
                // with some modifications
                bin: {
                  binary: true,
                },
                eof: {
                  endOfFile: true,
                },
                anim: {
                  animation: true,
                },
                calc: {
                  calculate: true,
                },
                dict: {
                  dictionary: true,
                },
                dup: {
                  duplicate: true,
                },
                enc: {
                  encode: true,
                  encryption: true,
                },
                gfx: {
                  graphics: true,
                },
                inc: {
                  increment: true,
                },
                nav: {
                  navigate: true,
                  navigation: true,
                },
                norm: {
                  normalize: true,
                },
                notif: {
                  notification: true,
                },
                perf: {
                  performance: true,
                },
                proc: {
                  process: true,
                },
                rand: {
                  random: true,
                },
                sys: {
                  system: true,
                },
              },
            },
          ],
        },
      },
    ]);

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
    noRestrictedImports(options.noRestrictedImports),
    preventAbbreviations(),
    defineFlatConfig,
  );
}
