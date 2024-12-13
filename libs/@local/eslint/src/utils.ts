import fs from "node:fs";
import path from "node:path";

import type { Linter } from "eslint";
import type { ESLintRules } from "eslint/rules";

export type ESConfig = Linter.Config<ESLintRules>;

export const defineConfig = <R extends Linter.RulesRecord>(
  config: readonly Linter.Config<R>[],
): readonly Linter.Config<R>[] => config;

/** Version of findUp that only considers the git repository and searches for `.gitignore`. */
export const projectIgnoreFiles = (directory: string): string[] => {
  // traverses the directory tree to find all `.gitignore` files, stops at the .git directory

  const gitignoreFiles: string[] = [];
  let currentDirectory = directory;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- termination is handled by the break statement
  while (true) {
    const parent = path.dirname(currentDirectory);
    const files = fs.readdirSync(currentDirectory);

    console.log({ parent, currentDirectory });

    if (files.includes(".gitignore")) {
      gitignoreFiles.push(path.join(currentDirectory, ".gitignore"));
    }

    if (files.includes(".git")) {
      // we have reached the .git directory, stop traversing
      break;
    }

    currentDirectory = parent;
  }

  return gitignoreFiles;
};
