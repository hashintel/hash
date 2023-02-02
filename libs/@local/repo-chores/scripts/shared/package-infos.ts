import path from "node:path";

import * as envalid from "envalid";
import fs from "fs-extra";

import { UserFriendlyError } from "./errors";
import { monorepoRoot } from "./monorepo-root";

export interface PackageInfo {
  name: string;
  path: string;
  version: string;
}

const packageParentFolders = [
  path.resolve(monorepoRoot, "libs"),
  path.resolve(monorepoRoot, "libs/@hashintel"),
];

export const listPublishablePackages = async (): Promise<PackageInfo[]> => {
  const result: PackageInfo[] = [];

  const packagePaths = (
    await Promise.all(
      packageParentFolders.map((parent) =>
        fs
          .readdir(parent)
          .then((children) => children.map((child) => `${parent}/${child}`)),
      ),
    )
  ).flat();

  for (const packagePath of packagePaths) {
    try {
      /* eslint-disable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access */
      const packageJson = await fs.readJson(`${packagePath}/package.json`);
      if (packageJson.private !== true) {
        result.push({
          name: packageJson.name,
          path: packagePath,
          version: packageJson.version,
        });
      }
      /* eslint-enable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access */
    } catch {
      // noop (libs/* is a file or does not contain package.json)
    }
  }

  return result;
};

export const derivePackageInfoFromEnv = async (): Promise<PackageInfo> => {
  const env = envalid.cleanEnv(process.env, {
    PACKAGE_DIR: envalid.str({
      desc: "location of package",
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
  return packageInfo;
};

export const outputPackageInfo = (packageInfo: PackageInfo): void => {
  console.log("");
  console.log(`Package name: ${packageInfo.name}`);
  console.log(`Package path: ${packageInfo.path}`);
  console.log("");
};
