import execa from "execa";

import { monorepoRoot } from "./monorepo-root";

export const checkIfDirHasUncommittedChanges = async (
  dirPath: string,
): Promise<boolean> => {
  const gitDiffResult = await execa("git", ["diff", "--exit-code", dirPath], {
    cwd: monorepoRoot,
    reject: false,
  });

  return gitDiffResult.exitCode > 0;
};
