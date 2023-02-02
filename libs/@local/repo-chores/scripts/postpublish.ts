import path from "node:path";

import chalk from "chalk";
import execa from "execa";
import fs from "fs-extra";

import { derivePackageInfoFromEnv } from "./shared/derive-package-info-from-env";
import { UserFriendlyError } from "./shared/errors";
import { checkIfDirHasUncommittedChanges } from "./shared/git";
import { monorepoRoot } from "./shared/monorepo-root";

const script = async () => {
  console.log(chalk.bold("Cleaning up after publishing..."));

  const packageInfo = await derivePackageInfoFromEnv();

  console.log("");
  console.log(`Package name: ${packageInfo.name}`);
  console.log(`Package path: ${packageInfo.path}`);
  console.log("");

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

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
  if (!packageJson.main.startsWith("dist/")) {
    throw new UserFriendlyError(
      'Expected `package.json` "main" field to start with "dist/". Exiting script to avoid loss of uncommitted changes. Did you forget to run the prepublish script?',
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
      cwd: monorepoRoot,
      reject: false,
    },
  );

  process.stdout.write(" Done\n");
};

export default script();
