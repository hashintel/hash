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

  const licenseFilePaths = await globby("**/license*", {
    absolute: true,
    caseSensitiveMatch: false,
    cwd: monorepoRootDirPath,
    ignore: ["**/node_modules/**"],
  });

  const usedLicenseFileSet = new Set<string>();

  let checkFailed = false;

  for (const workspaceDirPath of workspaceDirPaths) {
    const canonicalLicenseFilePath = path.resolve(
      workspaceDirPath,
      "LICENSE.md",
    );

    const currentLicenseFilePaths = licenseFilePaths
      .filter(
        (licenseFilePath) =>
          licenseFilePath.startsWith(workspaceDirPath) &&
          !licenseFilePath
            .slice(workspaceDirPath.length + 1)
            .includes(path.sep),
      )
      .sort((pathA, pathB) =>
        // Placing canonical license path before others
        pathA === canonicalLicenseFilePath
          ? -1
          : pathB === canonicalLicenseFilePath
          ? 1
          : pathA.localeCompare(pathB),
      );

    let licenseMdIsPresent = false;
    for (const licenseFilePath of currentLicenseFilePaths) {
      usedLicenseFileSet.add(licenseFilePath);
      if (licenseFilePath.endsWith("LICENSE.md")) {
        licenseMdIsPresent = true;
      }
    }

    let status: string;
    if (!currentLicenseFilePaths.length) {
      checkFailed = true;
      status = chalk.red("[MISSING] ");
    } else if (!licenseMdIsPresent) {
      checkFailed = true;
      status = chalk.red("[MISNAMED]");
    } else {
      status = chalk.green("[FOUND]   ");
    }

    console.log(
      status,
      (currentLicenseFilePaths.length
        ? currentLicenseFilePaths
        : [canonicalLicenseFilePath]
      )
        .map((licenseFilePath) =>
          path.relative(monorepoRootDirPath, licenseFilePath),
        )
        .join("\n           "),
    );
  }

  const unusedLicenseFilePaths = licenseFilePaths.filter(
    (licenseFilePath) => !usedLicenseFileSet.has(licenseFilePath),
  );

  if (unusedLicenseFilePaths.length) {
    for (const licenseFilePath of unusedLicenseFilePaths) {
      console.log(
        chalk.yellow("[EXTRA]   "),
        path.relative(monorepoRootDirPath, licenseFilePath),
      );
    }
  }

  if (checkFailed) {
    console.log();
    console.log(
      chalk.red(
        "Please make sure that each Yarn workspace has a LICENSE.md file",
      ),
    );
  }

  if (unusedLicenseFilePaths.length) {
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
