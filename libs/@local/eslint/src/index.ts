import { pipe } from "effect";
import { sheriff } from "eslint-config-sheriff";
import { defineFlatConfig, type FlatESLintConfig } from "eslint-define-config";

import { builtIn } from "./builtIn.js";
import { importPlugin } from "./import.js";
import { react } from "./react.js";
import { stylistic } from "./stylistic.js";
import { typescript } from "./typescript.js";
import { unicorn } from "./unicorn.js";
import { SheriffSettings } from "@sherifforg/types";

// A subset of the allowed rule config, because we're sane
export interface NoRestrictedImportsPath {
  name: string;
  message?: string;
  importNames?: string[];
}

export interface NoRestrictedImportsPattern {
  importNames?: [string, ...string[]];
  group: [string, ...string[]];
  importNamePattern?: string;
  message?: string;
  caseSensitive?: boolean;
}

export interface NoRestrictedImportsRule {
  paths?: (NoRestrictedImportsPath | string)[];
  patterns?: NoRestrictedImportsPattern[];
}

export interface Options {
  enabled: {
    frontend: "next" | "react" | false;
    playwright: boolean;
    tests: boolean;
  };
  noRestrictedImports?: () => NoRestrictedImportsRule[];
  mutableParametersRegex?: () => string[];
}

export const create = (options: Options): FlatESLintConfig[] => {
  const sheriffOptions: SheriffSettings = {
    react: options.enabled.frontend === "react",
    next: options.enabled.frontend === "next",
    // I want to move away from lodash, not add more of it
    lodash: false,
    playwright: options.enabled.playwright,
    jest: false,
    vitest: options.enabled.tests,
    ignores: {
      recommended: true,
      inheritedFromGitignore: true,
    },
  };

  return pipe(
    sheriff(sheriffOptions),
    defineFlatConfig,
    builtIn(options),
    importPlugin,
    unicorn,
    react(options),
    typescript,
    stylistic,
  );
};

export { defineFlatConfig, type FlatESLintConfig };
