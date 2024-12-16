import getGitignorePatterns from "eslint-config-flat-gitignore";
import { Array, pipe } from "effect";
import { sheriff, type SheriffSettings } from "eslint-config-sheriff";
import type { PartialDeep } from "type-fest";

import { builtIn } from "./builtIn.js";
import { importPlugin } from "./import.js";
import { react } from "./react.js";
import { stylistic } from "./stylistic.js";
import type { NoRestrictedImportsRule } from "./types.js";
import { typescript } from "./typescript.js";
import { jsdoc } from "./jsdoc.js";
import { unicorn } from "./unicorn.js";
import { vitest } from "./vitest.js";
import { projectIgnoreFiles, type ESConfig } from "./utils.js";

export type * from "./types.js";

export interface Modules {
  frontend: "next" | "react" | false;
  playwright: boolean;
  tests: boolean;
  storybook: boolean;
}

export interface Options {
  enabled: Modules;
  noRestrictedImports: () => NoRestrictedImportsRule[];
  mutableParametersRegex: () => string[];
}

export const create = (
  projectDirectory: string,
  // eslint-disable-next-line fsecond/prefer-destructured-optionals
  options?: PartialDeep<Options>,
): readonly ESConfig[] => {
  const sheriffOptions: SheriffSettings = {
    react: options?.enabled?.frontend === "react",
    next: options?.enabled?.frontend === "next",
    // I want to move away from lodash, not add more of it
    lodash: false,
    playwright: options?.enabled?.playwright ?? false,
    jest: false,
    vitest: options?.enabled?.tests ?? false,
    ignores: {
      recommended: true,
      inheritedFromGitignore: false,
    },
  };

  return pipe(
    sheriff(sheriffOptions) as readonly ESConfig[],
    Array.append(
      getGitignorePatterns({
        strict: false,
        files: projectIgnoreFiles(projectDirectory),
      }),
    ),
    builtIn(options ?? {}),
    importPlugin,
    unicorn,
    react(options ?? {}),
    typescript,
    stylistic,
    jsdoc,
    vitest(options ?? {}),
  );
};
