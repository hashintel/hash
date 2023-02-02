import path from "node:path";

import chalk from "chalk";
import * as envalid from "envalid";
import execa from "execa";
import fs from "fs-extra";

import { UserFriendlyError } from "./shared/errors";
import { monorepoRoot } from "./shared/monorepo-root";
import { listPublishablePackages } from "./shared/publishable-packages";

const ensureTermIsNotMentioned = async ({
  dirPath,
  term,
  advice,
}: {
  dirPath: string;
  term: string;
  advice: string;
}) => {
  const normalizedTermToAvoid = term.toLowerCase();
  const { stdout: rawFilePaths } = await execa("git", ["ls-files"], {
    cwd: dirPath,
  });

  const filePathsWithMentions: string[] = [];
  for (const filePath of rawFilePaths.split("\n")) {
    const resolvedFilePath = path.resolve(dirPath, filePath);
    if (
      (await fs.pathExists(resolvedFilePath)) &&
      (filePath.toLowerCase().includes(normalizedTermToAvoid) ||
        (await fs.readFile(resolvedFilePath, "utf8"))
          .toLowerCase()
          .includes(normalizedTermToAvoid))
    ) {
      filePathsWithMentions.push(resolvedFilePath);
    }
  }

  if (filePathsWithMentions.length) {
    throw new UserFriendlyError(
      `The following files still mention ${term}:\n  ${filePathsWithMentions
        .map((filePath) => path.relative(monorepoRoot, filePath))
        .join("\n  ")}${advice ? `\n${advice}` : ""}`,
    );
  }
};

const script = async () => {
  console.log(chalk.bold("Cleaning up before publishing..."));
  const env = envalid.cleanEnv(process.env, {
    PACKAGE_DIR: envalid.str({
      desc: "location of package to cleanup",
    }),
  });
  const packageDirPath = path.resolve(env.PACKAGE_DIR);

  if (packageDirPath !== env.PACKAGE_DIR) {
    throw new UserFriendlyError(
      `PACKAGE_DIR must be an absolute path, got ${packageDirPath}`,
    );
  }

  const publishablePackageInfos = await listPublishablePackages();
  const packageInfo = publishablePackageInfos.find(
    (currentPackageInfo) => currentPackageInfo.path === packageDirPath,
  );

  if (!packageInfo) {
    throw new UserFriendlyError(
      `PACKAGE_DIR (${packageDirPath}) does not point to a publishable package`,
    );
  }
  console.log("");
  console.log(`Package name: ${packageInfo.name}`);
  console.log(`Package path: ${packageInfo.path}`);
  console.log("");

  const gitDiffResult = await execa(
    "git",
    ["diff", "--exit-code", packageDirPath],
    {
      cwd: monorepoRoot,
      reject: false,
    },
  );

  if (gitDiffResult.exitCode) {
    throw new UserFriendlyError(
      `Please commit or revert changes in ${packageDirPath} before running this script`,
    );
  }

  // We depend on @local/eslint-config in yarn workspaces to be able to run ESLint.
  // However, we don't want this dependency to appear on npm for templates, so we remove it.
  // This script is meant to be run before publishing.

  process.stdout.write(`Removing ESLint...`);
  await fs.remove(path.join(packageDirPath, ".eslintrc.cjs"));

  await updateJson(path.join(packageDirPath, "package.json"), (packageJson) => {
    /* eslint-disable no-param-reassign -- see comment on updateJson() for potential improvement */
    delete packageJson.scripts["lint:eslint"];
    delete packageJson.scripts["fix:eslint"];
    delete packageJson.devDependencies.eslint;
    delete packageJson.devDependencies["@local/eslint-config"];
    /* eslint-enable no-param-reassign */
  });

  await ensureTermIsNotMentioned({
    dirPath: packageDirPath,
    term: "ESLint",
    advice: "Custom directives should be moved to .eslintrc.cjs",
  });

  process.stdout.write(" Done\n");
  process.stdout.write(`Removing prepublishOnly...`);

  await updateJson(path.join(packageDirPath, "package.json"), (packageJson) => {
    // eslint-disable-next-line no-param-reassign -- see comment on updateJson() for potential improvement
    delete packageJson.scripts.prepublishOnly;
  });

  process.stdout.write(" Done\n");
};

await script();
