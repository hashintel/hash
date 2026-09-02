import path from "node:path";

import chalk from "chalk";
import { globby } from "globby";

import { getWorkspaceInfoLookup, monorepoRootDirPath } from "./shared/monorepo";

const ignoredDirGlobs = [
  "**/dist/**",
  "**/node_modules/**",
  "**/runner_venv/**",
  "**/target/**",
  "**/venv/**",
  "**/.venv/**",
];

const cargoAndPyprojectGlobs = ["**/Cargo.toml", "**/pyproject.toml"];

const script = async () => {
  console.log("Checking license files in package directories...");

  const yarnWorkspaceInfoLookup = await getWorkspaceInfoLookup();

  const cargoAndPyprojectFilePaths = await globby(cargoAndPyprojectGlobs, {
    absolute: true,
    cwd: monorepoRootDirPath,
    dot: true,
    ignore: ignoredDirGlobs,
  });

  const packageDirPaths = [
    ...new Set([
      monorepoRootDirPath,
      ...Object.entries(yarnWorkspaceInfoLookup).map(([, yarnWorkspaceInfo]) =>
        path.resolve(monorepoRootDirPath, yarnWorkspaceInfo.location),
      ),
      ...cargoAndPyprojectFilePaths.map((manifestFilePath) =>
        path.dirname(manifestFilePath),
      ),
    ]),
  ].sort();

  const licenseFilePaths = await globby("**/licen{c,s}e*", {
    absolute: true,
    caseSensitiveMatch: false,
    cwd: monorepoRootDirPath,
    dot: true,
    ignore: ignoredDirGlobs,
  });

  const misspelledLicenseFileSet = new Set<string>();

  for (const licenseFilePath of licenseFilePaths) {
    const licenseFileName = path.basename(licenseFilePath);
    if (!licenseFileName.match(/^LICENSE(-[A-Z0-9]+)?(\.(md|txt))?$/)) {
      misspelledLicenseFileSet.add(licenseFilePath);
    }
  }

  const usedLicenseFileSet = new Set<string>();

  let checkFailed = false;

  for (const packageDirPath of packageDirPaths) {
    const canonicalLicenseFilePath = path.resolve(packageDirPath, "LICENSE.md");

    const currentLicenseFilePaths = licenseFilePaths.filter(
      (licenseFilePath) =>
        licenseFilePath.startsWith(packageDirPath) &&
        !licenseFilePath.slice(packageDirPath.length + 1).includes(path.sep),
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

  if (checkFailed || extraLicenseFilesArePresent) {
    console.log();
  }

  if (checkFailed) {
    console.log(
      chalk.red(
        "Each directory holding a package.json, Cargo.toml or pyproject.toml needs a LICENSE.md file. Additional license files need to be named as LICENSE-*.md (all caps)",
      ),
    );
  }

  if (extraLicenseFilesArePresent) {
    console.log(
      chalk.yellow(
        "You may want to delete or relocate extra license files which are not located in package directories",
      ),
    );
  }

  if (checkFailed) {
    process.exit(1);
  }
};

void (async () => {
  await script();
})();
