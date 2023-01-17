import path from "node:path";

import chalk from "chalk";
import execa from "execa";
import globby from "globby";

type WorkspaceInfo = {
  location: string;
  workspaceDependencies: string[];
  mismatchedWorkspaceDependencies: string[];
};

const monorepoRootDirPath = path.resolve(__filename, "../../../../..");

const script = async () => {
  console.log("Checking license files in Yarn workspaces...");

  const { stdout } = await execa("yarn", ["--silent", "workspaces", "info"], {
    env: { PATH: process.env.PATH },
    extendEnv: false, // Avoid passing FORCE_COLOR to a sub-process
  });

  const workspaceInfoLookup = JSON.parse(stdout) as Record<
    string,
    WorkspaceInfo
  >;

  const workspaceDirPaths = [
    monorepoRootDirPath,
    ...Object.entries(workspaceInfoLookup).map(([, workspaceInfo]) =>
      path.resolve(monorepoRootDirPath, workspaceInfo.location),
    ),
  ];

  const licenseFilePaths = await globby("**/licen{c,s}e*", {
    absolute: true,
    caseSensitiveMatch: false,
    cwd: monorepoRootDirPath,
    ignore: ["**/dist/**", "**/node_modules/**", "**/target/**", "**/venv/**"],
  });

  const misspelledLicenseFileSet = new Set<string>();

  for (const licenseFilePath of licenseFilePaths) {
    const licenseFileName = path.basename(licenseFilePath);
    if (!licenseFileName.match(/^LICENSE(-[A-Z0-9]+)?.md$/)) {
      misspelledLicenseFileSet.add(licenseFilePath);
    }
  }

  const usedLicenseFileSet = new Set<string>();

  let checkFailed = false;

  for (const workspaceDirPath of workspaceDirPaths) {
    const canonicalLicenseFilePath = path.resolve(
      workspaceDirPath,
      "LICENSE.md",
    );

    const currentLicenseFilePaths = licenseFilePaths.filter(
      (licenseFilePath) =>
        licenseFilePath.startsWith(workspaceDirPath) &&
        !licenseFilePath.slice(workspaceDirPath.length + 1).includes(path.sep),
    );

    let canonicalLicenseFilePathIsPresent = false;
    for (const licenseFilePath of currentLicenseFilePaths) {
      usedLicenseFileSet.add(licenseFilePath);
      if (licenseFilePath === canonicalLicenseFilePath) {
        canonicalLicenseFilePathIsPresent = true;
      }
    }

    if (!canonicalLicenseFilePathIsPresent) {
      checkFailed = true;
      console.log(
        chalk.red("[MISSING]"),
        path.relative(monorepoRootDirPath, canonicalLicenseFilePath),
      );
    } else {
      console.log(
        chalk.green("[FOUND]  "),
        path.relative(monorepoRootDirPath, canonicalLicenseFilePath),
      );
    }

    for (const licenseFilePath of currentLicenseFilePaths) {
      if (licenseFilePath === canonicalLicenseFilePath) {
        continue;
      }

      if (misspelledLicenseFileSet.has(licenseFilePath)) {
        checkFailed = true;
        console.log(
          chalk.red("[NAMING] "),
          path.relative(monorepoRootDirPath, licenseFilePath),
        );
      } else {
        console.log(
          chalk.yellow("         "),
          path.relative(monorepoRootDirPath, licenseFilePath),
        );
      }
    }
  }

  const unusedLicenseFilePaths = licenseFilePaths.filter(
    (licenseFilePath) => !usedLicenseFileSet.has(licenseFilePath),
  );

  let extraLicenseFilesArePresent = false;
  if (unusedLicenseFilePaths.length) {
    for (const licenseFilePath of unusedLicenseFilePaths) {
      if (misspelledLicenseFileSet.has(licenseFilePath)) {
        checkFailed = true;
        console.log(
          chalk.red("[NAMING] "),
          path.relative(monorepoRootDirPath, licenseFilePath),
        );
      } else {
        extraLicenseFilesArePresent = true;
        console.log(
          chalk.yellow("[EXTRA]  "),
          path.relative(monorepoRootDirPath, licenseFilePath),
        );
      }
    }
  }

  if (checkFailed) {
    console.log();
    console.log(
      chalk.red(
        "Please make sure that each Yarn workspace has a LICENSE.md file. Additional license files need to be named as LICENSE-*.md (all caps)",
      ),
    );
  }

  if (extraLicenseFilesArePresent) {
    console.log(
      chalk.yellow(
        "You may want to delete or relocate extra license files which are not located in Yarn workspaces",
      ),
    );
  }

  // @todo Uncomment when all workspaces have a license file
  // if (checkFailed) {
  //   process.exit(1);
  // }
};

void (async () => {
  await script();
})();
