import { defineFlatConfig, type FlatESLintConfig } from "eslint-define-config";
import { sheriff } from "eslint-config-sheriff";
import { pipe } from "effect";

import { builtIn } from "./builtIn.js";
import { unicorn } from "./unicorn.js";
import { importPlugin } from "./import.js";
import { react } from "./react.js";
import { typescript } from "./typescript.js";
import { stylistic } from "./stylistic.js";

export const JS_EXTENSIONS = "js,mjs,cjs,ts,mts,cts";
export const JSX_EXTENSIONS = "jsx,tsx,mtsx,mjsx";

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
    frontend: boolean;
    playwright: boolean;
    tests: boolean;
  };
  noRestrictedImports?: () => NoRestrictedImportsRule[];
  draftVariableRegex?: () => string[];
}

export const create = (options: Options): FlatESLintConfig[] => {
  const sheriffOptions = {
    react: false,
    next: options.enabled.frontend,
    // I want to move away from lodash, not add more of it
    lodash: false,
    playwright: options.enabled.playwright,
    jest: false,
    vitest: options.enabled.tests,
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
