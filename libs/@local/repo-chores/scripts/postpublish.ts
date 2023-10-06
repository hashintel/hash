import path from "node:path";

import chalk from "chalk";
import execa from "execa";
import fs from "fs-extra";

import { UserFriendlyError } from "./shared/errors";
import { checkIfDirHasUncommittedChanges } from "./shared/git";
import { monorepoRootDirPath } from "./shared/monorepo";
import {
  derivePackageInfoFromEnv,
  outputPackageInfo,
} from "./shared/package-infos";

const script = async () => {
  console.log(chalk.bold("Cleaning up after publishing..."));

  const packageInfo = await derivePackageInfoFromEnv();
  outputPackageInfo(packageInfo);

  if (!(await checkIfDirHasUncommittedChanges(packageInfo.path))) {
    console.log(
      "No uncommitted changes detected. Did you forget to run the prepublish script?",
    );
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const packageJson = await fs.readJson(
    path.join(packageInfo.path, "package.json"),
  );

  if (
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
    ("main" in packageJson && !packageJson.main.startsWith("dist/")) ||
    ("exports" in packageJson &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      Object.values(packageJson.exports as Record<string, string>).some(
        (value) => !value.startsWith("./dist/"),
      ))
  ) {
    throw new UserFriendlyError(
      'Expected `package.json` main or exports field to have values containing "dist/". Exiting script to avoid loss of uncommitted changes. Did you forget to run the prepublish script?',
    );
  }

  process.stdout.write("Resetting directory contents...");

  await execa(
    "git",
    [
      "restore",
      "--source=HEAD",
      "--staged",
      "--worktree",
      "--",
      packageInfo.path,
    ],
    {
      cwd: monorepoRootDirPath,
      reject: false,
    },
  );

  process.stdout.write(" Done\n");
};

export default script();
