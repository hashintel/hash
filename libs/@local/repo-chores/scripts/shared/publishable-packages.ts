import path from "node:path";

import fs from "fs-extra";

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
