import path from "node:path";

import chalk from "chalk";
import fs from "fs-extra";

import { derivePackageInfoFromEnv } from "./shared/derive-package-info-from-env";
import { UserFriendlyError } from "./shared/errors";
import { checkIfDirHasUncommittedChanges } from "./shared/git";
import { updateJson } from "./shared/update-json";

const script = async () => {
  console.log(chalk.bold("Cleaning up before publishing..."));

  const packageInfo = await derivePackageInfoFromEnv();

  console.log("");
  console.log(`Package name: ${packageInfo.name}`);
  console.log(`Package path: ${packageInfo.path}`);
  console.log("");

  if (await checkIfDirHasUncommittedChanges(packageInfo.path)) {
    throw new UserFriendlyError(
      `Please commit or revert changes in ${packageInfo.path} before running this script`,
    );
  }

  if (!(await fs.pathExists(path.resolve(packageInfo.path, ".npmignore")))) {
    throw new UserFriendlyError(
      `Please create .npmignore in ${packageInfo.path} before running this script`,
    );
  }

  process.stdout.write(`Updating package.json...`);

  await updateJson(
    path.join(packageInfo.path, "package.json"),
    (packageJson) => {
      /* eslint-disable @typescript-eslint/no-unsafe-member-access,no-param-reassign -- see comment on updateJson() for potential improvement */
      if (packageJson.main !== "src/main.ts") {
        throw new UserFriendlyError(
          "Unexpected value for field `main` in `package.json`. Please align this package with other publishable packages for consistency",
        );
      }
      packageJson.main = "dist/main.js";

      if (packageJson.types !== "src/main.ts") {
        throw new UserFriendlyError(
          "Unexpected value for field `types` in `package.json`. Please align this package with other publishable packages for consistency",
        );
      }
      packageJson.types = "dist/main.d.js";

      if (packageJson.exports) {
        throw new UserFriendlyError(
          "Please replace `exports` in `package.json` with `main` and `types` for consistency",
        );
      }

      delete packageJson.devDependencies;
      /* eslint-enable @typescript-eslint/no-unsafe-member-access,no-param-reassign */
    },
  );

  process.stdout.write(" Done\n");
};

export default script();
