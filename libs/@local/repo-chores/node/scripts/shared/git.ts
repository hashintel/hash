import { execa } from "execa";

import { monorepoRootDirPath } from "./monorepo";

export const checkIfDirHasUncommittedChanges = async (
  dirPath: string,
): Promise<boolean> => {
  const gitDiffResult = await execa("git", ["diff", "--exit-code", dirPath], {
    cwd: monorepoRootDirPath,
    reject: false,
  });

  const { stdout: untrackedFiles } = await execa(
    "git",
    ["ls-files", "--others", "--exclude-standard", "--", dirPath],
    {
      cwd: monorepoRootDirPath,
    },
  );

  if (untrackedFiles.trim().length > 0) {
    // there are untracked files
    return true;
  }

  // The exit code is undefined if the command was interrupted by a signal or failed to spawn
  return (
    (gitDiffResult.exitCode && gitDiffResult.exitCode > 0) ||
    untrackedFiles.trim().length > 0
  );
};
