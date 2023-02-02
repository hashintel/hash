import path from "node:path";

import * as envalid from "envalid";

import { UserFriendlyError } from "./errors";
import { listPublishablePackages, PackageInfo } from "./publishable-packages";

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
