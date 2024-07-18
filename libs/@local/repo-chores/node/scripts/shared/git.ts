import execa from "execa";

import { monorepoRootDirPath } from "./monorepo";

export const checkIfDirHasUncommittedChanges = async (
  dirPath: string,
): Promise<boolean> => {
  const gitDiffResult = await execa("git", ["diff", "--exit-code", dirPath], {
    cwd: monorepoRootDirPath,
    reject: false,
  });

  return gitDiffResult.exitCode > 0;
};
